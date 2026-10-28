import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { getMessagingAdapter } from '@/lib/messaging';
import { getTemplate } from '@/lib/templates';
import type { Database } from '@/types/database';
import {
  CLAIM_STALE_MS,
  STUCK_SENDING_MS,
  UNKNOWN_SMS_ALERT_THRESHOLD,
  campaignStepMessageSid,
  classifyMessageInsertError,
  decideReplyEnrollmentAction,
  getCampaignReplyMode,
  hasFreshClaim,
  parkedNextSendAt,
  planEnrollmentStart,
  selectCampaignForUrgency,
} from '@/services/campaign-logic';
import {
  decideOnDuplicateSid,
  decideReconcileRow,
} from '@/services/reconcile-logic';
import { deferUntilQuietHoursOpen } from '@/services/quiet-hours';
import { tryNormalizeToE164 } from '@/lib/phone';
import {
  SuppressionLookupError,
  isPhoneSuppressed,
} from '@/services/suppressions';

type Business = Database['public']['Tables']['businesses']['Row'];
type Lead = Database['public']['Tables']['leads']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];
type CampaignStep = Database['public']['Tables']['campaign_steps']['Row'];
type CampaignEnrollment =
  Database['public']['Tables']['campaign_enrollments']['Row'];

export type EnrollmentResult =
  | {
      enrolled: true;
      campaignId: string;
      campaignName: string;
      currentStep: number;
      nextSendAt: string;
      skippedInitial: boolean;
      switched?: boolean;
    }
  | { enrolled: false; reason: string };

type Supabase = ReturnType<typeof createServerClient>;

export async function enrollLeadInCampaign(
  leadId: string
): Promise<EnrollmentResult> {
  const supabase = createServerClient();

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*, businesses(*)')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) {
    console.error('Failed to fetch lead for enrollment:', leadError);
    return { enrolled: false, reason: 'lead_not_found' };
  }

  if (lead.opted_out) {
    return { enrolled: false, reason: 'opted_out' };
  }

  const existing = await getEnrollmentForLead(leadId);
  if (existing) {
    return {
      enrolled: false,
      reason: `already_enrolled:${existing.status}`,
    };
  }

  const { data: campaigns, error: campaignError } = await supabase
    .from('campaigns')
    .select('*, campaign_steps(*)')
    .eq('status', 'active')
    .eq('auto_enroll', true);

  if (campaignError || !campaigns || campaigns.length === 0) {
    console.warn('No active campaigns found for enrollment');
    return { enrolled: false, reason: 'no_campaigns' };
  }

  const selectedCampaign = selectCampaignForUrgency(
    campaigns as Array<Campaign & { campaign_steps: CampaignStep[] }>,
    lead.urgency
  );

  if (!selectedCampaign) {
    console.warn('No matching campaign found for lead');
    return { enrolled: false, reason: 'no_matching_campaign' };
  }

  const steps = (
    (selectedCampaign.campaign_steps as unknown as CampaignStep[]) || []
  )
    .slice()
    .sort((a, b) => a.step_number - b.step_number);

  if (steps.length === 0) {
    console.error('Campaign has no steps');
    return { enrolled: false, reason: 'no_steps' };
  }

  const recoveryAlreadySent = Boolean(lead.sms_outbound_sid);
  const plan = planEnrollmentStart(steps, { recoveryAlreadySent });

  if (
    plan.skippedInitial &&
    plan.currentStep === steps[0].step_number &&
    steps.length === 1
  ) {
    return { enrolled: false, reason: 'only_initial_already_sent' };
  }

  const nextSendAt = plan.nextSendAt.toISOString();

  const { error: enrollError } = await supabase
    .from('campaign_enrollments')
    .insert({
      lead_id: leadId,
      campaign_id: selectedCampaign.id,
      current_step: plan.currentStep,
      status: 'active',
      next_send_at: nextSendAt,
      claimed_at: null,
      claim_token: null,
    });

  if (enrollError) {
    if (enrollError.code === '23505') {
      return { enrolled: false, reason: 'already_enrolled:unique' };
    }
    console.error('Failed to enroll lead:', enrollError);
    return { enrolled: false, reason: 'insert_failed' };
  }

  console.log(
    `Lead ${leadId} enrolled in campaign ${selectedCampaign.name} ` +
      `(urgency=${lead.urgency ?? 'null'}, step=${plan.currentStep}` +
      `${plan.skippedInitial ? ', skipped initial' : ''}), next send: ${nextSendAt}`
  );

  return {
    enrolled: true,
    campaignId: selectedCampaign.id,
    campaignName: selectedCampaign.name,
    currentStep: plan.currentStep,
    nextSendAt,
    skippedInitial: plan.skippedInitial,
  };
}

/**
 * Switch enrollment to another campaign. Refuses while a fresh claim is held.
 * Requires status='active' and no fresh claim (claim_token/claimed_at cleared or stale).
 */
export async function switchEnrollmentCampaign(
  leadId: string,
  targetCampaignId: string
): Promise<EnrollmentResult> {
  const supabase = createServerClient();

  const existing = await getEnrollmentForLead(leadId);
  if (!existing) {
    return { enrolled: false, reason: 'no_enrollment' };
  }
  if (hasFreshClaim(existing)) {
    return { enrolled: false, reason: 'deferred_fresh_claim' };
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) {
    return { enrolled: false, reason: 'lead_not_found' };
  }

  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .select('*, campaign_steps(*)')
    .eq('id', targetCampaignId)
    .single();

  if (campError || !campaign) {
    return { enrolled: false, reason: 'campaign_not_found' };
  }

  const steps = (
    (campaign.campaign_steps as unknown as CampaignStep[]) || []
  )
    .slice()
    .sort((a, b) => a.step_number - b.step_number);

  if (steps.length === 0) {
    return { enrolled: false, reason: 'no_steps' };
  }

  const plan = planEnrollmentStart(steps, {
    recoveryAlreadySent: Boolean(lead.sms_outbound_sid),
  });
  const nextSendAt = plan.nextSendAt.toISOString();
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString();

  // Only switch when not mid-send: claim_token null OR claim stale.
  const { data: updated, error: updateError } = await supabase
    .from('campaign_enrollments')
    .update({
      campaign_id: targetCampaignId,
      current_step: plan.currentStep,
      status: 'active',
      next_send_at: nextSendAt,
      claimed_at: null,
      claim_token: null,
      paused_at: null,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', leadId)
    .eq('status', 'active')
    .or(`claim_token.is.null,claimed_at.lt.${staleBefore}`)
    .select('id')
    .maybeSingle();

  if (updateError || !updated) {
    console.error('Failed to switch enrollment (maybe mid-send):', updateError);
    return { enrolled: false, reason: 'deferred_or_switch_failed' };
  }

  console.log(
    `Lead ${leadId} switched to campaign ${campaign.name}, ` +
      `step=${plan.currentStep}, next send: ${nextSendAt}`
  );

  return {
    enrolled: true,
    campaignId: targetCampaignId,
    campaignName: campaign.name,
    currentStep: plan.currentStep,
    nextSendAt,
    skippedInitial: plan.skippedInitial,
    switched: true,
  };
}

export async function handleClassifiedReplyEnrollment(
  leadId: string,
  urgency: string | null
): Promise<{ action: string; campaignName?: string }> {
  const supabase = createServerClient();
  const enrollment = await getEnrollmentForLead(leadId);
  const replyMode = getCampaignReplyMode();

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, urgency_filter')
    .eq('status', 'active')
    .eq('auto_enroll', true);

  const target = selectCampaignForUrgency(campaigns || [], urgency);
  const decision = decideReplyEnrollmentAction(
    enrollment
      ? {
          id: enrollment.id,
          campaign_id: enrollment.campaign_id,
          status: enrollment.status,
          claimed_at: enrollment.claimed_at,
          claim_token: enrollment.claim_token,
        }
      : null,
    target,
    { replyMode }
  );

  if (decision.action === 'defer_switch' && target) {
    console.log(
      `Deferring switch for lead ${leadId}; fresh claim held (mid-send)`
    );
    return { action: 'defer_switch', campaignName: target.name };
  }

  if (decision.action === 'switch' && target) {
    const result = await switchEnrollmentCampaign(leadId, target.id);
    if (!result.enrolled && result.reason.startsWith('deferred')) {
      return { action: 'defer_switch', campaignName: target.name };
    }
    return {
      action: result.enrolled ? 'switch' : `skip:${result.reason}`,
      campaignName: result.enrolled ? result.campaignName : target.name,
    };
  }

  if (decision.action === 'pause') {
    await pauseCampaignForLead(leadId);
    return { action: 'pause' };
  }

  if (!enrollment) {
    const result = await enrollLeadInCampaign(leadId);
    return {
      action: result.enrolled ? 'enroll' : `skip:${result.reason}`,
      campaignName: result.enrolled ? result.campaignName : undefined,
    };
  }

  return { action: 'noop' };
}

export async function getEnrollmentForLead(
  leadId: string
): Promise<CampaignEnrollment | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('campaign_enrollments')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch enrollment for lead:', error);
    return null;
  }
  return data;
}

/**
 * Send SMS for a campaign step. Requires an active claim_token on the row.
 * Insert-before-send with campaign-scoped UNIQUE(message_sid).
 */
export async function sendCampaignSMS(
  enrollmentId: string,
  claimToken?: string
): Promise<boolean> {
  const supabase = createServerClient();

  const { data: enrollment, error: enrollError } = await supabase
    .from('campaign_enrollments')
    .select('*, leads!inner(*, businesses(*)), campaigns!inner(*)')
    .eq('id', enrollmentId)
    .single();

  if (enrollError || !enrollment) {
    console.error('Failed to fetch enrollment:', enrollError);
    return false;
  }

  const token = claimToken || enrollment.claim_token;
  if (!token) {
    console.error(`No claim_token for enrollment ${enrollmentId}`);
    return false;
  }

  const lead = (enrollment as any).leads as Lead & { businesses: Business };
  const business = lead.businesses;
  const campaign = (enrollment as any).campaigns as Campaign;

  if (lead.opted_out) {
    await pauseCampaignForLead(lead.id);
    return true;
  }

  try {
    if (await isPhoneSuppressed(business.id, lead.caller_phone)) {
      console.log(`Suppressed phone for enrollment ${enrollmentId}; pausing`);
      await pauseCampaignForLead(lead.id);
      return true;
    }
  } catch (err) {
    if (err instanceof SuppressionLookupError) {
      console.error('Suppression check failed closed:', err.message);
      await releaseClaim(supabase, enrollmentId, token);
      return false;
    }
    throw err;
  }

  const { data: steps, error: stepsError } = await supabase
    .from('campaign_steps')
    .select('*')
    .eq('campaign_id', campaign.id)
    .order('step_number', { ascending: true });

  if (stepsError || !steps || steps.length === 0) {
    console.error('Failed to fetch campaign steps:', stepsError);
    await releaseClaim(supabase, enrollmentId, token);
    return false;
  }

  const currentStep = steps.find(
    (s) => s.step_number === enrollment.current_step
  );

  if (!currentStep) {
    console.error(`Step ${enrollment.current_step} not found`);
    await releaseClaim(supabase, enrollmentId, token);
    return false;
  }

  if (
    currentStep.delay_minutes === 0 &&
    lead.sms_outbound_sid &&
    enrollment.current_step === steps[0]?.step_number
  ) {
    console.log(
      `Skipping initial campaign SMS for ${enrollmentId}; recovery SMS already sent`
    );
    await advanceEnrollment(
      supabase,
      enrollmentId,
      token,
      enrollment.current_step,
      steps
    );
    return true;
  }

  // Quiet hours: defer (never drop) until local window opens.
  const phoneE164 =
    tryNormalizeToE164(lead.caller_phone) || lead.caller_phone;
  const quiet = deferUntilQuietHoursOpen(new Date(), {
    callerPhoneE164: phoneE164,
    businessTimezone: business.timezone,
  });
  if (!quiet.allowed) {
    console.log(
      `Quiet hours defer enrollment ${enrollmentId} until ${quiet.nextSendAt.toISOString()} (${quiet.timeZone})`
    );
    await releaseClaim(supabase, enrollmentId, token, {
      nextSendAt: quiet.nextSendAt.toISOString(),
    });
    return true;
  }

  const stepSid = campaignStepMessageSid(
    enrollmentId,
    campaign.id,
    enrollment.current_step
  );

  const messageBody = getTemplate(currentStep.template_key, {
    business: business.name,
    name: '',
    issue: lead.issue || '',
  });

  const { error: insertError } = await supabase.from('sms_messages').insert({
    lead_id: lead.id,
    direction: 'outbound',
    body: messageBody,
    message_sid: stepSid,
    status: 'sending',
  });

  const insertClass = classifyMessageInsertError(insertError);
  if (insertClass === 'duplicate') {
    // Advance ONLY if the existing row is confirmed sent. Otherwise park
    // until reconcile has checked the relay.
    const { data: existing } = await supabase
      .from('sms_messages')
      .select('id, status')
      .eq('message_sid', stepSid)
      .maybeSingle();

    const decision = decideOnDuplicateSid(existing?.status);
    if (decision.action === 'advance') {
      console.log(
        `Duplicate sid ${stepSid} confirmed (${existing?.status}) — advancing`
      );
      await advanceEnrollment(
        supabase,
        enrollmentId,
        token,
        enrollment.current_step,
        steps
      );
      return true;
    }

    console.log(
      `Duplicate sid ${stepSid} status=${existing?.status ?? 'missing'} — parking until reconcile`
    );
    await parkEnrollmentForReconcile(supabase, enrollmentId, token);
    return false;
  }
  if (insertClass === 'failed') {
    console.error('Failed to insert sending sms_messages row:', insertError);
    await releaseClaim(supabase, enrollmentId, token);
    return false;
  }

  try {
    const message = await getMessagingAdapter().sendMessage({
      to: lead.caller_phone,
      body: messageBody,
      auto: true,
      idempotencyKey: stepSid,
    });

    await supabase
      .from('sms_messages')
      .update({ status: message.status || 'queued' })
      .eq('message_sid', stepSid);

    const advanced = await advanceEnrollment(
      supabase,
      enrollmentId,
      token,
      enrollment.current_step,
      steps
    );
    if (!advanced) {
      console.warn(
        `Post-send advance lost claim ownership for ${enrollmentId} (paused/switched mid-send)`
      );
    }

    console.log(
      `Campaign SMS sent for ${enrollmentId} step ${enrollment.current_step} ` +
        `(provider=${message.id}, sid=${stepSid})`
    );

    return true;
  } catch (error) {
    console.error('Failed to send campaign SMS (mark unknown):', error);
    await supabase
      .from('sms_messages')
      .update({ status: 'unknown' })
      .eq('message_sid', stepSid);

    // Park until reconcile confirms or requeues the exact step from the sid.
    await parkEnrollmentForReconcile(supabase, enrollmentId, token);
    return false;
  }
}

/**
 * Advance only if we still own the claim (status=active AND claim_token matches).
 * Returns false when ownership was lost (pause/switch mid-send).
 */
export async function advanceEnrollment(
  supabase: Supabase,
  enrollmentId: string,
  claimToken: string,
  currentStepNumber: number,
  steps: CampaignStep[]
): Promise<boolean> {
  const nextStepNumber = currentStepNumber + 1;
  const nextStep = steps.find((s) => s.step_number === nextStepNumber);

  if (nextStep) {
    const nextSendAt = new Date(
      Date.now() + nextStep.delay_minutes * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
      .from('campaign_enrollments')
      .update({
        current_step: nextStepNumber,
        next_send_at: nextSendAt,
        claimed_at: null,
        claim_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId)
      .eq('status', 'active')
      .eq('claim_token', claimToken)
      .select('id');

    if (error || !data?.length) {
      console.warn(
        `advanceEnrollment ownership miss for ${enrollmentId}:`,
        error?.message
      );
      return false;
    }

    console.log(
      `Campaign advanced to step ${nextStepNumber}, scheduled for ${nextSendAt}`
    );
    return true;
  }

  const { data, error } = await supabase
    .from('campaign_enrollments')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      next_send_at: null,
      claimed_at: null,
      claim_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollmentId)
    .eq('status', 'active')
    .eq('claim_token', claimToken)
    .select('id');

  if (error || !data?.length) {
    console.warn(
      `completeEnrollment ownership miss for ${enrollmentId}:`,
      error?.message
    );
    return false;
  }

  console.log(`Campaign completed for enrollment ${enrollmentId}`);
  return true;
}

async function releaseClaim(
  supabase: Supabase,
  enrollmentId: string,
  claimToken: string,
  opts?: { nextSendAt?: string }
): Promise<void> {
  await supabase
    .from('campaign_enrollments')
    .update({
      claimed_at: null,
      claim_token: null,
      next_send_at:
        opts?.nextSendAt ??
        new Date(Date.now() + CLAIM_STALE_MS).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollmentId)
    .eq('status', 'active')
    .eq('claim_token', claimToken);
}

/**
 * Park an enrollment with an ambiguous send until reconcile resolves it.
 * Uses a far-future next_send_at so cron will not reclaim/resend.
 */
async function parkEnrollmentForReconcile(
  supabase: Supabase,
  enrollmentId: string,
  claimToken: string
): Promise<void> {
  await releaseClaim(supabase, enrollmentId, claimToken, {
    nextSendAt: parkedNextSendAt(),
  });
}

/**
 * Pause active enrollments. Allowed mid-send: clears claim so the in-flight
 * worker's advanceEnrollment ownership check fails (no accidental next step).
 */
export async function pauseCampaignForLead(leadId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('campaign_enrollments')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString(),
      next_send_at: null,
      claimed_at: null,
      claim_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', leadId)
    .eq('status', 'active');

  if (error) {
    console.error('Failed to pause campaign:', error);
    return;
  }

  console.log(`Campaign paused for lead ${leadId}`);
}

export async function leadHasActiveEnrollment(
  leadId: string
): Promise<boolean> {
  const enrollment = await getEnrollmentForLead(leadId);
  return enrollment?.status === 'active';
}

/**
 * Atomically claim a due (or stale-claimed) enrollment with a fresh claim_token.
 */
export async function claimDueEnrollment(
  enrollmentId: string
): Promise<string | null> {
  const supabase = createServerClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString();
  const token = randomUUID();

  const due = await supabase
    .from('campaign_enrollments')
    .update({
      next_send_at: null,
      claimed_at: nowIso,
      claim_token: token,
      updated_at: nowIso,
    })
    .eq('id', enrollmentId)
    .eq('status', 'active')
    .lte('next_send_at', nowIso)
    .is('claim_token', null)
    .select('id, claim_token');

  if (!due.error && (due.data?.length ?? 0) > 0) {
    return token;
  }

  const stale = await supabase
    .from('campaign_enrollments')
    .update({
      claimed_at: nowIso,
      claim_token: token,
      updated_at: nowIso,
    })
    .eq('id', enrollmentId)
    .eq('status', 'active')
    .is('next_send_at', null)
    .lt('claimed_at', staleBefore)
    .select('id, claim_token');

  if (stale.error) {
    console.error('Failed to reclaim stale enrollment:', stale.error);
    return null;
  }
  return (stale.data?.length ?? 0) > 0 ? token : null;
}

export async function listClaimableEnrollmentIds(
  limit = 100
): Promise<string[]> {
  const supabase = createServerClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString();

  const { data: due } = await supabase
    .from('campaign_enrollments')
    .select('id')
    .eq('status', 'active')
    .lte('next_send_at', nowIso)
    .is('claim_token', null)
    .order('next_send_at', { ascending: true })
    .limit(limit);

  const { data: stale } = await supabase
    .from('campaign_enrollments')
    .select('id')
    .eq('status', 'active')
    .is('next_send_at', null)
    .lt('claimed_at', staleBefore)
    .limit(limit);

  const ids = new Set<string>();
  for (const row of due || []) ids.add(row.id);
  for (const row of stale || []) ids.add(row.id);
  return [...ids].slice(0, limit);
}

export type ReconcileResult = {
  unknownCount: number;
  stuckSendingCount: number;
  requeued: number;
  confirmed: number;
  parked: number;
  alert: boolean;
};

/**
 * Reconcile unknown / stuck 'sending' rows against the relay by idempotency key.
 *
 * State machine (first principles):
 * - outcome=sent → mark confirmed; for campaign sids advance that exact step
 * - outcome=never_sent → abandon sid; requeue the exact step parsed from sid
 * - outcome=unknown (bare 404, array, missing lookup, errors) → leave parked
 * - recovery:* sids are handled separately (never mutate campaign current_step)
 */
export async function reconcileAmbiguousSms(): Promise<ReconcileResult> {
  const supabase = createServerClient();
  const adapter = getMessagingAdapter();
  const cutoff = new Date(Date.now() - STUCK_SENDING_MS).toISOString();

  const { data: ambiguous, error } = await supabase
    .from('sms_messages')
    .select('id, lead_id, message_sid, status, sent_at')
    .in('status', ['unknown', 'sending'])
    .lte('sent_at', cutoff)
    .limit(50);

  if (error) {
    console.error('Failed to list ambiguous sms_messages:', error);
    return {
      unknownCount: 0,
      stuckSendingCount: 0,
      requeued: 0,
      confirmed: 0,
      parked: 0,
      alert: false,
    };
  }

  let unknownCount = 0;
  let stuckSendingCount = 0;
  let requeued = 0;
  let confirmed = 0;
  let parked = 0;

  for (const row of ambiguous || []) {
    if (row.status === 'unknown') unknownCount++;
    if (row.status === 'sending') stuckSendingCount++;

    const sid = row.message_sid;

    let outcome: 'sent' | 'never_sent' | 'unknown' = 'unknown';
    let providerStatus = 'queued';

    if (!adapter.lookupByIdempotencyKey) {
      // No lookup capability → cannot decide; keep parked.
      parked++;
      continue;
    }

    try {
      const lookup = await adapter.lookupByIdempotencyKey(sid);
      outcome = lookup.outcome;
      if (lookup.outcome === 'sent') {
        providerStatus = lookup.status || 'queued';
      }
    } catch (err) {
      console.error(
        'Relay lookup failed for',
        sid,
        err instanceof Error ? err.message : 'unknown'
      );
      parked++;
      continue;
    }

    const decision = decideReconcileRow({
      sid,
      outcome,
      providerStatus,
    });

    if (decision.action === 'confirm') {
      await supabase
        .from('sms_messages')
        .update({ status: decision.providerStatus })
        .eq('id', row.id);
      confirmed++;

      if (decision.parsed.kind === 'campaign') {
        await advanceEnrollmentAfterConfirmedSend(
          supabase,
          decision.parsed.enrollmentId,
          decision.parsed.campaignId,
          decision.parsed.stepNumber
        );
      }
      continue;
    }

    if (decision.action === 'park') {
      parked++;
      continue;
    }

    // Definite never_sent — free the sid and requeue the exact step / recovery.
    const abandonedSid = `${sid}:abandoned:${Date.now()}`;
    await supabase
      .from('sms_messages')
      .update({
        message_sid: abandonedSid,
        status: 'abandoned_retry',
      })
      .eq('id', row.id);

    if (decision.action === 'requeue_campaign') {
      const ok = await requeueExactCampaignStep(
        supabase,
        decision.enrollmentId,
        decision.campaignId,
        decision.stepNumber
      );
      if (ok) requeued++;
    } else if (decision.action === 'requeue_recovery') {
      await supabase
        .from('leads')
        .update({
          sms_outbound_sid: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', decision.leadId)
        .eq('sms_outbound_sid', sid);
      requeued++;
    }
  }

  const total = unknownCount + stuckSendingCount;
  const threshold = Number(
    process.env.UNKNOWN_SMS_ALERT_THRESHOLD || UNKNOWN_SMS_ALERT_THRESHOLD
  );
  const alert = total >= threshold;
  if (alert) {
    console.error(
      `ALERT: ${total} ambiguous SMS rows (unknown=${unknownCount}, stuck_sending=${stuckSendingCount}, parked=${parked}) >= threshold ${threshold}`
    );
  }

  return {
    unknownCount,
    stuckSendingCount,
    requeued,
    confirmed,
    parked,
    alert,
  };
}

/**
 * After reconcile confirms a campaign step was sent, advance past that step
 * if the enrollment is still active on it (and not mid-claim).
 */
async function advanceEnrollmentAfterConfirmedSend(
  supabase: Supabase,
  enrollmentId: string,
  campaignId: string,
  stepNumber: number
): Promise<void> {
  const { data: enrollment } = await supabase
    .from('campaign_enrollments')
    .select('id, campaign_id, current_step, status, claim_token')
    .eq('id', enrollmentId)
    .eq('status', 'active')
    .maybeSingle();

  if (!enrollment) return;
  if (enrollment.campaign_id !== campaignId) return;
  if (enrollment.current_step !== stepNumber) return;
  // Don't steal a live claim — the in-flight sender owns advance.
  if (enrollment.claim_token) return;

  const { data: steps } = await supabase
    .from('campaign_steps')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('step_number', { ascending: true });

  if (!steps?.length) return;

  const nextStep = steps.find((s) => s.step_number === stepNumber + 1);
  if (nextStep) {
    const nextSendAt = new Date(
      Date.now() + nextStep.delay_minutes * 60 * 1000
    ).toISOString();
    await supabase
      .from('campaign_enrollments')
      .update({
        current_step: nextStep.step_number,
        next_send_at: nextSendAt,
        claimed_at: null,
        claim_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId)
      .eq('status', 'active')
      .eq('current_step', stepNumber)
      .is('claim_token', null);
  } else {
    await supabase
      .from('campaign_enrollments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        next_send_at: null,
        claimed_at: null,
        claim_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId)
      .eq('status', 'active')
      .eq('current_step', stepNumber)
      .is('claim_token', null);
  }
}

/**
 * Requeue the exact campaign step encoded in the sid (no skip / reorder).
 */
async function requeueExactCampaignStep(
  supabase: Supabase,
  enrollmentId: string,
  campaignId: string,
  stepNumber: number
): Promise<boolean> {
  const { data: enrollment } = await supabase
    .from('campaign_enrollments')
    .select('id, campaign_id, status')
    .eq('id', enrollmentId)
    .eq('status', 'active')
    .maybeSingle();

  if (!enrollment || enrollment.campaign_id !== campaignId) {
    return false;
  }

  const { data, error } = await supabase
    .from('campaign_enrollments')
    .update({
      current_step: stepNumber,
      next_send_at: new Date().toISOString(),
      claimed_at: null,
      claim_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollmentId)
    .eq('status', 'active')
    .eq('campaign_id', campaignId)
    .select('id');

  if (error || !data?.length) {
    console.warn(
      `requeueExactCampaignStep failed for ${enrollmentId} step ${stepNumber}:`,
      error?.message
    );
    return false;
  }
  return true;
}

export async function processDueCampaigns(): Promise<{
  processed: number;
  errors: number;
  skipped: number;
  messagingProvider: string;
  unknownCount: number;
  stuckSendingCount: number;
  requeued: number;
  confirmed: number;
  alert: boolean;
}> {
  const adapter = getMessagingAdapter();
  const reconcile = await reconcileAmbiguousSms();

  const ids = await listClaimableEnrollmentIds(100);

  if (ids.length === 0) {
    console.log('No due campaigns to process');
    return {
      processed: 0,
      errors: 0,
      skipped: 0,
      messagingProvider: adapter.name,
      ...reconcile,
    };
  }

  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const id of ids) {
    const token = await claimDueEnrollment(id);
    if (!token) {
      skipped++;
      continue;
    }

    const success = await sendCampaignSMS(id, token);
    if (success) {
      processed++;
    } else {
      errors++;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(
    `Processed ${processed} campaigns, ${errors} errors, ${skipped} skipped ` +
      `out of ${ids.length} candidates (provider=${adapter.name})`
  );

  return {
    processed,
    errors,
    skipped,
    messagingProvider: adapter.name,
    ...reconcile,
  };
}
