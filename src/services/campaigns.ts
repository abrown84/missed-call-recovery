import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { getMessagingAdapter } from '@/lib/messaging';
import {
  ensureRelayKeySupportProbed,
  warnIfRelayLookupUnsupported,
} from '@/lib/messaging/brwn-relay';
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
// parkedNextSendAt imported above
import {
  decideOnDuplicateSid,
  decideReconcileRow,
  normalizeLookupOutcome,
  MAX_RECONCILE_ATTEMPTS,
} from '@/services/reconcile-logic';
import { deferUntilQuietHoursOpen } from '@/services/quiet-hours';
import {
  classifyRecoverySmsStatus,
  isFailedSmsStatus,
  isRelayKeySupportConfirmed,
  recoveryMessageSid,
} from '@/services/sms-sid';
import { tryNormalizeToE164 } from '@/lib/phone';
import { sendRecoverySMS } from '@/services/sms';
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

  // Gate step 1 on recovery's *resolved* outcome — not just sms_outbound_sid.
  // Pending/unknown recovery → start at step 1 but park until reconcile decides.
  const recoveryState = await getRecoverySendState(supabase, leadId);
  const recoveryConfirmed =
    recoveryState === 'confirmed' || Boolean(lead.sms_outbound_sid);
  const plan = planEnrollmentStart(steps, {
    recoveryAlreadySent: recoveryConfirmed,
  });

  if (
    plan.skippedInitial &&
    plan.currentStep === steps[0].step_number &&
    steps.length === 1
  ) {
    return { enrolled: false, reason: 'only_initial_already_sent' };
  }

  let nextSendAt = plan.nextSendAt.toISOString();
  if (recoveryState === 'pending' && !recoveryConfirmed) {
    // Don't fire campaign step 1 while recovery is ambiguous.
    nextSendAt = parkedNextSendAt();
  }

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

  // Gate delay-0 step 1 on recovery resolution (prevents double text).
  if (
    currentStep.delay_minutes === 0 &&
    enrollment.current_step === steps[0]?.step_number
  ) {
    const recoveryState = await getRecoverySendState(supabase, lead.id);
    if (recoveryState === 'confirmed' || lead.sms_outbound_sid) {
      console.log(
        `Skipping initial campaign SMS for ${enrollmentId}; recovery confirmed`
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
    if (recoveryState === 'pending') {
      console.log(
        `Parking enrollment ${enrollmentId}; recovery SMS still unresolved`
      );
      await parkEnrollmentForReconcile(supabase, enrollmentId, token);
      return false;
    }
  }

  // Quiet hours: defer (never drop) until local window opens.
  const phoneE164 =
    tryNormalizeToE164(lead.caller_phone) || lead.caller_phone;
  let quiet;
  try {
    quiet = deferUntilQuietHoursOpen(new Date(), {
      callerPhoneE164: phoneE164,
      businessTimezone: business.timezone,
    });
  } catch (err) {
    console.error(
      `Quiet-hours timezone error for ${enrollmentId}:`,
      err instanceof Error ? err.message : 'unknown'
    );
    await releaseClaim(supabase, enrollmentId, token, {
      nextSendAt: parkedNextSendAt(),
    });
    return false;
  }
  if (!quiet.allowed) {
    if ('unresolved' in quiet && quiet.unresolved) {
      console.error(
        `ALERT: quiet-hours unresolved for enrollment ${enrollmentId} (${quiet.reason}); not sending`
      );
      await releaseClaim(supabase, enrollmentId, token, {
        nextSendAt: parkedNextSendAt(),
      });
      return false;
    }
    console.log(
      `Quiet hours defer enrollment ${enrollmentId} until ${quiet.nextSendAt.toISOString()} zones=${quiet.zones.join(',')}`
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

  // key_supported_at_send stays false until BOTH: capabilities.idempotency
  // was true before send AND the response echoed idempotencyKey.
  const { error: insertError } = await supabase.from('sms_messages').insert({
    lead_id: lead.id,
    direction: 'outbound',
    body: messageBody,
    message_sid: stepSid,
    status: 'sending',
    key_supported_at_send: false,
  });

  const insertClass = classifyMessageInsertError(insertError);
  if (insertClass === 'duplicate') {
    // Advance ONLY if the existing row is confirmed sent (not failed).
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
    if (decision.action === 'needs_review') {
      console.error(
        `ALERT: duplicate sid ${stepSid} has failed status — needs_review, not advancing`
      );
      await supabase
        .from('sms_messages')
        .update({ status: 'needs_review' })
        .eq('message_sid', stepSid);
      await parkEnrollmentForReconcile(supabase, enrollmentId, token);
      return false;
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
    const adapter = getMessagingAdapter();
    // Caps probe before send (cron already probes; this covers other callers).
    await ensureRelayKeySupportProbed(adapter);

    const message = await adapter.sendMessage({
      to: lead.caller_phone,
      body: messageBody,
      auto: true,
      idempotencyKey: stepSid,
    });

    // Trust never_sent later only if capabilities were true *before* send
    // AND this response echoed the key (relay >= 1.7.6).
    if (isRelayKeySupportConfirmed() && message.keyEchoed) {
      await supabase
        .from('sms_messages')
        .update({ key_supported_at_send: true })
        .eq('message_sid', stepSid);
    }

    // 409 conflict or failed status → needs_review, NEVER advance.
    if (
      message.conflict ||
      isFailedSmsStatus(message.status) ||
      (message.duplicate && isFailedSmsStatus(message.status))
    ) {
      console.error(
        `ALERT: campaign SMS failed/conflict for ${enrollmentId} sid=${stepSid} status=${message.status}`
      );
      await supabase
        .from('sms_messages')
        .update({ status: 'needs_review' })
        .eq('message_sid', stepSid);
      await parkEnrollmentForReconcile(supabase, enrollmentId, token);
      return false;
    }

    // 429 recent_send on keyed send → ambiguous (park), not a hard error.
    if (message.ambiguous || message.status === 'unknown') {
      await supabase
        .from('sms_messages')
        .update({ status: 'unknown' })
        .eq('message_sid', stepSid);
      await parkEnrollmentForReconcile(supabase, enrollmentId, token);
      console.warn(
        `Campaign SMS ambiguous for ${enrollmentId} step ${enrollment.current_step} ` +
          `(sid=${stepSid}); parked for reconcile`
      );
      return false;
    }

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
        `(provider=${message.id}, sid=${stepSid}` +
        `${message.duplicate ? ', duplicate' : ''})`
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
  needsReview: number;
  alert: boolean;
};

/**
 * Reconcile unknown / stuck 'sending' rows against the relay by idempotency key.
 *
 * - outcome=sent → confirm; advance campaign step from sid
 * - outcome=never_sent (explicit only) → abandon sid; requeue exact step / resend recovery
 * - outcome=unknown / missing → increment attempts; park or needs_review
 * - ORDER BY oldest first so a backlog cannot starve new rows
 */
export async function reconcileAmbiguousSms(): Promise<ReconcileResult> {
  const supabase = createServerClient();
  const adapter = getMessagingAdapter();
  const cutoff = new Date(Date.now() - STUCK_SENDING_MS).toISOString();

  const { data: ambiguous, error } = await supabase
    .from('sms_messages')
    .select(
      'id, lead_id, message_sid, status, sent_at, reconcile_attempts, key_supported_at_send'
    )
    .in('status', ['unknown', 'sending'])
    .lte('sent_at', cutoff)
    .order('sent_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('Failed to list ambiguous sms_messages:', error);
    return {
      unknownCount: 0,
      stuckSendingCount: 0,
      requeued: 0,
      confirmed: 0,
      parked: 0,
      needsReview: 0,
      alert: false,
    };
  }

  let unknownCount = 0;
  let stuckSendingCount = 0;
  let requeued = 0;
  let confirmed = 0;
  let parked = 0;
  let needsReview = 0;

  for (const row of ambiguous || []) {
    if (row.status === 'unknown') unknownCount++;
    if (row.status === 'sending') stuckSendingCount++;

    const sid = row.message_sid;
    const attempts = Number(
      (row as { reconcile_attempts?: number }).reconcile_attempts ?? 0
    );
    const keySupportedAtSend = Boolean(
      (row as { key_supported_at_send?: boolean | null }).key_supported_at_send
    );

    let outcome: 'sent' | 'never_sent' | 'unknown' | 'failed' = 'unknown';
    let providerStatus = 'queued';

    if (!adapter.lookupByIdempotencyKey) {
      await bumpReconcileAttempt(supabase, row.id, attempts, 'park');
      parked++;
      continue;
    }

    try {
      const lookup = await adapter.lookupByIdempotencyKey(sid);
      const normalized = normalizeLookupOutcome(lookup);
      outcome = normalized.outcome;
      providerStatus = normalized.providerStatus;
    } catch (err) {
      console.error(
        'Relay lookup failed for',
        sid,
        err instanceof Error ? err.message : 'unknown'
      );
      await bumpReconcileAttempt(supabase, row.id, attempts, 'park');
      parked++;
      continue;
    }

    const decision = decideReconcileRow({
      sid,
      outcome,
      providerStatus,
      reconcileAttempts: attempts,
      keySupportedAtSend,
    });

    if (decision.action === 'confirm') {
      await supabase
        .from('sms_messages')
        .update({ status: decision.providerStatus, reconcile_attempts: 0 })
        .eq('id', row.id);
      confirmed++;

      if (decision.parsed.kind === 'campaign') {
        await advanceEnrollmentAfterConfirmedSend(
          supabase,
          decision.parsed.enrollmentId,
          decision.parsed.campaignId,
          decision.parsed.stepNumber
        );
      } else if (decision.parsed.kind === 'recovery') {
        await supabase
          .from('leads')
          .update({
            sms_outbound_sid: recoveryMessageSid(decision.parsed.leadId),
            updated_at: new Date().toISOString(),
          })
          .eq('id', decision.parsed.leadId);
      }
      continue;
    }

    if (decision.action === 'needs_review') {
      console.error(
        `ALERT: sms row ${row.id} → needs_review (${decision.reason ?? 'unspecified'}) sid=${sid}`
      );
      await bumpReconcileAttempt(supabase, row.id, attempts, 'needs_review');
      needsReview++;
      continue;
    }

    if (decision.action === 'park') {
      await bumpReconcileAttempt(supabase, row.id, attempts, 'park');
      parked++;
      continue;
    }

    // Explicit never_sent only — free the sid and requeue / resend.
    const abandonedSid = `${sid}:abandoned:${Date.now()}`;
    await supabase
      .from('sms_messages')
      .update({
        message_sid: abandonedSid,
        status: 'abandoned_retry',
        reconcile_attempts: 0,
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
      await resendRecoveryIdempotent(supabase, decision.leadId, sid);
      requeued++;
    }
  }

  const { count: needsReviewTotal } = await supabase
    .from('sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'needs_review');

  const parkedOrReview = parked + needsReview + (needsReviewTotal ?? 0);
  const threshold = Number(
    process.env.UNKNOWN_SMS_ALERT_THRESHOLD || UNKNOWN_SMS_ALERT_THRESHOLD
  );
  // Alert on ANY parked/needs_review in this pass, or backlog ≥ threshold.
  const alert =
    parkedOrReview > 0 ||
    unknownCount + stuckSendingCount >= threshold;
  if (alert) {
    console.error(
      `ALERT: ambiguous SMS (unknown=${unknownCount}, stuck_sending=${stuckSendingCount}, ` +
        `parked=${parked}, needs_review=${needsReview}, backlog_needs_review=${needsReviewTotal ?? 0}) ` +
        `threshold=${threshold} max_attempts=${MAX_RECONCILE_ATTEMPTS}`
    );
  }

  return {
    unknownCount,
    stuckSendingCount,
    requeued,
    confirmed,
    parked,
    needsReview,
    alert,
  };
}

async function bumpReconcileAttempt(
  supabase: Supabase,
  rowId: string,
  attempts: number,
  mode: 'park' | 'needs_review'
): Promise<void> {
  const next = attempts + 1;
  await supabase
    .from('sms_messages')
    .update({
      reconcile_attempts: next,
      status: mode === 'needs_review' ? 'needs_review' : 'unknown',
    })
    .eq('id', rowId);
}

async function getRecoverySendState(
  supabase: Supabase,
  leadId: string
): Promise<'confirmed' | 'pending' | 'absent' | 'abandoned'> {
  const sid = recoveryMessageSid(leadId);
  const { data } = await supabase
    .from('sms_messages')
    .select('status')
    .eq('message_sid', sid)
    .maybeSingle();
  return classifyRecoverySmsStatus(data?.status);
}

/**
 * After never_sent on a recovery sid: clear outbound marker and actually
 * resend recovery SMS (insert-before-send is idempotent on the freed sid).
 */
async function resendRecoveryIdempotent(
  supabase: Supabase,
  leadId: string,
  abandonedOriginalSid: string
): Promise<void> {
  await supabase
    .from('leads')
    .update({
      sms_outbound_sid: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .eq('sms_outbound_sid', abandonedOriginalSid);

  const { data: lead } = await supabase
    .from('leads')
    .select('*, businesses(*)')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead || lead.opted_out) return;
  const business = (lead as { businesses?: Business }).businesses;
  if (!business) return;

  try {
    await sendRecoverySMS(leadId, business, lead.caller_phone);
  } catch (err) {
    console.error(
      `Recovery resend failed for ${leadId}:`,
      err instanceof Error ? err.message : 'unknown'
    );
  }
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
  parked: number;
  needsReview: number;
  alert: boolean;
  relayLookupSupported?: boolean;
}> {
  const adapter = getMessagingAdapter();

  // Probe GET /api/capabilities (relay >= 1.7.6). Without idempotency:true,
  // never_sent must not requeue (rows stay needs_review).
  let relayLookupSupported: boolean | undefined;
  if (adapter.checkLookupSupport) {
    const support = await warnIfRelayLookupUnsupported(adapter);
    relayLookupSupported = support.supported;
  }

  const reconcile = await reconcileAmbiguousSms();

  const ids = await listClaimableEnrollmentIds(100);

  if (ids.length === 0) {
    console.log('No due campaigns to process');
    return {
      processed: 0,
      errors: 0,
      skipped: 0,
      messagingProvider: adapter.name,
      relayLookupSupported,
      ...reconcile,
    };
  }

  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const id of ids) {
    try {
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
    } catch (err) {
      // Isolate per-enrollment failures (e.g. invalid timezone) so one bad
      // lead cannot 500 the whole cron run.
      console.error(
        `Campaign send failed for ${id}:`,
        err instanceof Error ? err.message : 'unknown'
      );
      errors++;
      try {
        const supabase = createServerClient();
        await supabase
          .from('campaign_enrollments')
          .update({
            claim_token: null,
            claimed_at: null,
            next_send_at: parkedNextSendAt(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('status', 'active');
      } catch {
        /* ignore release failure */
      }
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
    relayLookupSupported,
    ...reconcile,
  };
}
