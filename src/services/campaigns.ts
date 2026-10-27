import { createServerClient } from '@/lib/supabase';
import { getMessagingAdapter } from '@/lib/messaging';
import { getTemplate } from '@/lib/templates';
import type { Database } from '@/types/database';
import {
  campaignStepMessageSid,
  planEnrollmentStart,
  selectCampaignForUrgency,
  shouldSendCampaignStep,
} from '@/services/campaign-logic';

type Business = Database['public']['Tables']['businesses']['Row'];
type Lead = Database['public']['Tables']['leads']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];
type CampaignStep = Database['public']['Tables']['campaign_steps']['Row'];

export type EnrollmentResult =
  | {
      enrolled: true;
      campaignId: string;
      campaignName: string;
      currentStep: number;
      nextSendAt: string;
      skippedInitial: boolean;
    }
  | { enrolled: false; reason: string };

/**
 * Campaign Service
 * Handles multi-touch SMS campaign enrollment and execution
 */

/**
 * Auto-enroll a lead in the campaign matching its urgency.
 * Call only after urgency is set (inbound classification), so Emergency /
 * High sequences can match. Skips a delay-0 initial step when the missed-
 * call recovery SMS already covered that first touch.
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
  ).slice().sort((a, b) => a.step_number - b.step_number);

  if (steps.length === 0) {
    console.error('Campaign has no steps');
    return { enrolled: false, reason: 'no_steps' };
  }

  const recoveryAlreadySent = Boolean(lead.sms_outbound_sid);
  const plan = planEnrollmentStart(steps, { recoveryAlreadySent });

  // Nothing left after skipping the initial recovery touch.
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
    });

  if (enrollError) {
    // Unique (lead_id, campaign_id) — already enrolled; treat as success.
    if (enrollError.code === '23505') {
      console.log(
        `Lead ${leadId} already enrolled in campaign ${selectedCampaign.name}`
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
 * Send SMS for a campaign step (idempotent per enrollment+step).
 */
export async function sendCampaignSMS(
  enrollmentId: string
): Promise<boolean> {
  const supabase = createServerClient();

  const { data: enrollment, error: enrollError } = await supabase
    .from('campaign_enrollments')
    .select(
      '*, leads!inner(*, businesses(*)), campaigns!inner(*)'
    )
    .eq('id', enrollmentId)
    .single();

  if (enrollError || !enrollment) {
    console.error('Failed to fetch enrollment:', enrollError);
    return false;
  }

  const lead = (enrollment as any).leads as Lead & { businesses: Business };
  const business = lead.businesses;
  const campaign = (enrollment as any).campaigns as Campaign;

  const { data: steps, error: stepsError } = await supabase
    .from('campaign_steps')
    .select('*')
    .eq('campaign_id', campaign.id)
    .order('step_number', { ascending: true });

  if (stepsError || !steps || steps.length === 0) {
    console.error('Failed to fetch campaign steps:', stepsError);
    return false;
  }

  const currentStep = steps.find(
    (s) => s.step_number === enrollment.current_step
  );

  if (!currentStep) {
    console.error(`Step ${enrollment.current_step} not found`);
    return false;
  }

  const stepSid = campaignStepMessageSid(
    enrollmentId,
    enrollment.current_step
  );

  const { data: priorMessages } = await supabase
    .from('sms_messages')
    .select('message_sid')
    .eq('lead_id', lead.id)
    .eq('direction', 'outbound');

  const existingSids = [
    lead.sms_outbound_sid,
    ...(priorMessages || []).map((m) => m.message_sid),
  ];

  // Idempotency: never re-send the same enrollment step.
  if (!shouldSendCampaignStep(enrollmentId, enrollment.current_step, existingSids)) {
    console.log(
      `Skipping duplicate campaign step ${enrollment.current_step} for ${enrollmentId}`
    );
    await advanceEnrollment(supabase, enrollmentId, enrollment.current_step, steps);
    return true;
  }

  // Extra guard: delay-0 initial while recovery SMS already sent.
  if (
    currentStep.delay_minutes === 0 &&
    lead.sms_outbound_sid &&
    enrollment.current_step === steps[0]?.step_number
  ) {
    console.log(
      `Skipping initial campaign SMS for ${enrollmentId}; recovery SMS already sent`
    );
    await advanceEnrollment(supabase, enrollmentId, enrollment.current_step, steps);
    return true;
  }

  try {
    const messageBody = getTemplate(currentStep.template_key, {
      business: business.name,
      name: '',
      issue: lead.issue || '',
    });

    const message = await getMessagingAdapter().sendMessage({
      to: lead.caller_phone,
      body: messageBody,
      auto: true,
    });

    await supabase.from('sms_messages').insert({
      lead_id: lead.id,
      direction: 'outbound',
      body: messageBody,
      // Prefer stable sid for idempotency; keep provider id in status notes via body log.
      message_sid: stepSid,
      status: message.status,
    });

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
    console.error('Failed to send campaign SMS:', error);
    // Re-queue shortly so a transient failure retries on the next cron tick.
    await supabase
      .from('campaign_enrollments')
      .update({
        next_send_at: new Date(Date.now() + 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId)
      .eq('status', 'active');
    return false;
  }
}

async function advanceEnrollment(
  supabase: ReturnType<typeof createServerClient>,
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
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId);

    console.log(`Campaign completed for enrollment ${enrollmentId}`);
  }
}

/**
 * Pause campaign enrollment (called when lead responds again after enrollment).
 */
export async function pauseCampaignForLead(leadId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('campaign_enrollments')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString(),
      next_send_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', leadId)
    .eq('status', 'active');

  if (error) {
    console.error('Failed to pause campaign:', error);
    return;
  }

  console.log(`Campaign paused for lead ${leadId} (responded)`);
}

/**
 * True when the lead already has an active enrollment (used to distinguish
 * first classified reply — enroll — from later replies — pause).
 */
export async function leadHasActiveEnrollment(
  leadId: string
): Promise<boolean> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('campaign_enrollments')
    .select('id')
    .eq('lead_id', leadId)
    .eq('status', 'active')
    .limit(1);

  if (error) {
    console.error('Failed to check enrollment:', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Atomically claim a due enrollment so concurrent cron workers do not
 * double-send. Clears next_send_at only if it is still due and active.
 */
export async function claimDueEnrollment(
  enrollmentId: string
): Promise<boolean> {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('campaign_enrollments')
    .update({
      next_send_at: null,
      updated_at: now,
    })
    .eq('id', enrollmentId)
    .eq('status', 'active')
    .lte('next_send_at', now)
    .select('id');

  if (error) {
    console.error('Failed to claim enrollment:', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Process all due campaign messages (called by cron).
 * Claims each enrollment before send for concurrent-run safety.
 */
export async function processDueCampaigns(): Promise<{
  processed: number;
  errors: number;
  skipped: number;
}> {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { data: enrollments, error } = await supabase
    .from('campaign_enrollments')
    .select('id, next_send_at')
    .eq('status', 'active')
    .lte('next_send_at', now)
    .order('next_send_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('Failed to fetch due enrollments:', error);
    return { processed: 0, errors: 0, skipped: 0 };
  }

  if (!enrollments || enrollments.length === 0) {
    console.log('No due campaigns to process');
    return { processed: 0, errors: 0, skipped: 0 };
  }

  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const enrollment of enrollments) {
    const claimed = await claimDueEnrollment(enrollment.id);
    if (!claimed) {
      skipped++;
      continue;
    }

    const success = await sendCampaignSMS(enrollment.id);
    if (success) {
      processed++;
    } else {
      errors++;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(
    `Processed ${processed} campaigns, ${errors} errors, ${skipped} skipped ` +
      `out of ${enrollments.length} due (at ${now})`
  );

  return { processed, errors, skipped };
}
