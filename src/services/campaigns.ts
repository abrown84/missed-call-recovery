import { createServerClient } from '@/lib/supabase';
import { getMessagingAdapter } from '@/lib/messaging';
import { getTemplate } from '@/lib/templates';
import type { Database } from '@/types/database';
import {
  CLAIM_STALE_MS,
  campaignStepMessageSid,
  classifyMessageInsertError,
  decideReplyEnrollmentAction,
  planEnrollmentStart,
  selectCampaignForUrgency,
} from '@/services/campaign-logic';
import { isPhoneSuppressed } from '@/services/suppressions';

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

/**
 * Enroll a lead in the campaign matching its urgency (null → Standard).
 * Skips delay-0 initial when recovery SMS already covers that touch.
 * UNIQUE(lead_id) makes concurrent enrolls safe (23505 → already enrolled).
 */
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

  // Any prior enrollment (active/paused/completed) blocks a fresh insert.
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
    });

  if (enrollError) {
    if (enrollError.code === '23505') {
      console.log(`Lead ${leadId} already has an enrollment (unique lead_id)`);
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
 * Switch an existing enrollment to a different urgency campaign (re-route).
 * Keeps UNIQUE(lead_id); updates in place and skips delay-0 initial.
 */
export async function switchEnrollmentCampaign(
  leadId: string,
  targetCampaignId: string
): Promise<EnrollmentResult> {
  const supabase = createServerClient();

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

  const { data: updated, error: updateError } = await supabase
    .from('campaign_enrollments')
    .update({
      campaign_id: targetCampaignId,
      current_step: plan.currentStep,
      status: 'active',
      next_send_at: nextSendAt,
      claimed_at: null,
      paused_at: null,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', leadId)
    .select('id')
    .maybeSingle();

  if (updateError || !updated) {
    console.error('Failed to switch enrollment:', updateError);
    return { enrolled: false, reason: 'switch_failed' };
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

/**
 * After classification: switch to urgency campaign, pause, or noop.
 * Never inserts a second enrollment (anti ping-pong).
 */
export async function handleClassifiedReplyEnrollment(
  leadId: string,
  urgency: string | null
): Promise<{ action: string; campaignName?: string }> {
  const supabase = createServerClient();

  const enrollment = await getEnrollmentForLead(leadId);

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
        }
      : null,
    target
  );

  if (decision.action === 'switch' && target) {
    const result = await switchEnrollmentCampaign(leadId, target.id);
    return {
      action: 'switch',
      campaignName: result.enrolled ? result.campaignName : target.name,
    };
  }

  if (decision.action === 'pause') {
    await pauseCampaignForLead(leadId);
    return { action: 'pause' };
  }

  // No enrollment yet (shouldn't happen if missed-call enrolls) — enroll once.
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
 * Send SMS for a campaign step.
 * Insert-before-send with UNIQUE(message_sid); never auto-resend on timeout.
 */
export async function sendCampaignSMS(
  enrollmentId: string
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

  const lead = (enrollment as any).leads as Lead & { businesses: Business };
  const business = lead.businesses;
  const campaign = (enrollment as any).campaigns as Campaign;

  if (lead.opted_out) {
    await pauseCampaignForLead(lead.id);
    return true;
  }

  if (await isPhoneSuppressed(business.id, lead.caller_phone)) {
    console.log(`Suppressed phone for enrollment ${enrollmentId}; pausing`);
    await pauseCampaignForLead(lead.id);
    return true;
  }

  const { data: steps, error: stepsError } = await supabase
    .from('campaign_steps')
    .select('*')
    .eq('campaign_id', campaign.id)
    .order('step_number', { ascending: true });

  if (stepsError || !steps || steps.length === 0) {
    console.error('Failed to fetch campaign steps:', stepsError);
    await releaseClaimWithoutReschedule(supabase, enrollmentId);
    return false;
  }

  const currentStep = steps.find(
    (s) => s.step_number === enrollment.current_step
  );

  if (!currentStep) {
    console.error(`Step ${enrollment.current_step} not found`);
    await releaseClaimWithoutReschedule(supabase, enrollmentId);
    return false;
  }

  // Skip delay-0 initial when recovery already sent.
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
      enrollment.current_step,
      steps
    );
    return true;
  }

  const stepSid = campaignStepMessageSid(
    enrollmentId,
    enrollment.current_step
  );

  const messageBody = getTemplate(currentStep.template_key, {
    business: business.name,
    name: '',
    issue: lead.issue || '',
  });

  // Insert-before-send: UNIQUE(message_sid) is the source of truth.
  const { error: insertError } = await supabase.from('sms_messages').insert({
    lead_id: lead.id,
    direction: 'outbound',
    body: messageBody,
    message_sid: stepSid,
    status: 'sending',
  });

  const insertClass = classifyMessageInsertError(insertError);
  if (insertClass === 'duplicate') {
    console.log(
      `Duplicate sid ${stepSid} — treating as already sent, advancing`
    );
    await advanceEnrollment(
      supabase,
      enrollmentId,
      enrollment.current_step,
      steps
    );
    return true;
  }
  if (insertClass === 'failed') {
    console.error('Failed to insert sending sms_messages row:', insertError);
    await releaseClaimWithoutReschedule(supabase, enrollmentId);
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

    await advanceEnrollment(
      supabase,
      enrollmentId,
      enrollment.current_step,
      steps
    );

    console.log(
      `Campaign SMS sent for ${enrollmentId} step ${enrollment.current_step} ` +
        `(provider=${message.id}, sid=${stepSid})`
    );

    return true;
  } catch (error) {
    console.error('Failed to send campaign SMS (no auto-resend):', error);
    // Ambiguous delivery — mark unknown and do NOT requeue this step.
    await supabase
      .from('sms_messages')
      .update({ status: 'unknown' })
      .eq('message_sid', stepSid);

    await advanceEnrollment(
      supabase,
      enrollmentId,
      enrollment.current_step,
      steps
    );
    return false;
  }
}

async function advanceEnrollment(
  supabase: Supabase,
  enrollmentId: string,
  currentStepNumber: number,
  steps: CampaignStep[]
): Promise<void> {
  const nextStepNumber = currentStepNumber + 1;
  const nextStep = steps.find((s) => s.step_number === nextStepNumber);

  if (nextStep) {
    const nextSendAt = new Date(
      Date.now() + nextStep.delay_minutes * 60 * 1000
    ).toISOString();

    await supabase
      .from('campaign_enrollments')
      .update({
        current_step: nextStepNumber,
        next_send_at: nextSendAt,
        claimed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId);

    console.log(
      `Campaign advanced to step ${nextStepNumber}, scheduled for ${nextSendAt}`
    );
  } else {
    await supabase
      .from('campaign_enrollments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        next_send_at: null,
        claimed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId);

    console.log(`Campaign completed for enrollment ${enrollmentId}`);
  }
}

/** Clear a stuck claim without scheduling a retry (used on hard failures). */
async function releaseClaimWithoutReschedule(
  supabase: Supabase,
  enrollmentId: string
): Promise<void> {
  const retryAt = new Date(Date.now() + CLAIM_STALE_MS).toISOString();
  await supabase
    .from('campaign_enrollments')
    .update({
      claimed_at: null,
      // Far enough that a flapping failure does not tight-loop; not a 60s resend.
      next_send_at: retryAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollmentId)
    .eq('status', 'active');
}

export async function pauseCampaignForLead(leadId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('campaign_enrollments')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString(),
      next_send_at: null,
      claimed_at: null,
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

/** @deprecated Prefer getEnrollmentForLead — any status, not only active. */
export async function leadHasActiveEnrollment(
  leadId: string
): Promise<boolean> {
  const enrollment = await getEnrollmentForLead(leadId);
  return enrollment?.status === 'active';
}

/**
 * Atomically claim a due (or stale-claimed) enrollment.
 * Sets claimed_at=now(), clears next_send_at.
 */
export async function claimDueEnrollment(
  enrollmentId: string
): Promise<boolean> {
  const supabase = createServerClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString();

  // Path A: due and unclaimed (or claim already cleared).
  const due = await supabase
    .from('campaign_enrollments')
    .update({
      next_send_at: null,
      claimed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', enrollmentId)
    .eq('status', 'active')
    .lte('next_send_at', nowIso)
    .is('claimed_at', null)
    .select('id');

  if (!due.error && (due.data?.length ?? 0) > 0) {
    return true;
  }

  // Path B: reclaim stale claim (crash left next_send_at null + old claimed_at).
  const stale = await supabase
    .from('campaign_enrollments')
    .update({
      claimed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', enrollmentId)
    .eq('status', 'active')
    .is('next_send_at', null)
    .lt('claimed_at', staleBefore)
    .select('id');

  if (stale.error) {
    console.error('Failed to reclaim stale enrollment:', stale.error);
    return false;
  }
  return (stale.data?.length ?? 0) > 0;
}

/**
 * List enrollments that are due or have a reclaimable stale claim.
 */
export async function listClaimableEnrollmentIds(
  limit = 100
): Promise<string[]> {
  const supabase = createServerClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString();

  const { data: due, error: dueError } = await supabase
    .from('campaign_enrollments')
    .select('id')
    .eq('status', 'active')
    .lte('next_send_at', nowIso)
    .is('claimed_at', null)
    .order('next_send_at', { ascending: true })
    .limit(limit);

  if (dueError) {
    console.error('Failed to fetch due enrollments:', dueError);
  }

  const { data: stale, error: staleError } = await supabase
    .from('campaign_enrollments')
    .select('id')
    .eq('status', 'active')
    .is('next_send_at', null)
    .lt('claimed_at', staleBefore)
    .limit(limit);

  if (staleError) {
    console.error('Failed to fetch stale claims:', staleError);
  }

  const ids = new Set<string>();
  for (const row of due || []) ids.add(row.id);
  for (const row of stale || []) ids.add(row.id);
  return [...ids].slice(0, limit);
}

export async function processDueCampaigns(): Promise<{
  processed: number;
  errors: number;
  skipped: number;
  messagingProvider: string;
}> {
  const adapter = getMessagingAdapter();
  const ids = await listClaimableEnrollmentIds(100);

  if (ids.length === 0) {
    console.log('No due campaigns to process');
    return {
      processed: 0,
      errors: 0,
      skipped: 0,
      messagingProvider: adapter.name,
    };
  }

  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const id of ids) {
    const claimed = await claimDueEnrollment(id);
    if (!claimed) {
      skipped++;
      continue;
    }

    const success = await sendCampaignSMS(id);
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
  };
}
