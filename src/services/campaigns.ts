import { createServerClient } from '@/lib/supabase';
import { sendSMS } from '@/lib/twilio';
import { getTemplate } from '@/lib/templates';
import type { Database } from '@/types/database';

type Business = Database['public']['Tables']['businesses']['Row'];
type Lead = Database['public']['Tables']['leads']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];
type CampaignStep = Database['public']['Tables']['campaign_steps']['Row'];
type CampaignEnrollment = Database['public']['Tables']['campaign_enrollments']['Row'];

/**
 * Campaign Service
 * Handles multi-touch SMS campaign enrollment and execution
 */

/**
 * Auto-enroll a lead in appropriate campaign based on urgency
 */
export async function enrollLeadInCampaign(leadId: string): Promise<void> {
  const supabase = createServerClient();

  // Get lead details
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*, businesses(*)')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) {
    console.error('Failed to fetch lead for enrollment:', leadError);
    return;
  }

  // Find appropriate campaign
  const { data: campaigns, error: campaignError } = await supabase
    .from('campaigns')
    .select('*, campaign_steps(*)')
    .eq('status', 'active')
    .eq('auto_enroll', true)
    .order('campaign_steps(step_number)', { ascending: true });

  if (campaignError || !campaigns || campaigns.length === 0) {
    console.warn('No active campaigns found for enrollment');
    return;
  }

  // Match campaign by urgency
  let selectedCampaign = campaigns.find(
    (c) => c.urgency_filter === lead.urgency
  );

  // Fallback to general campaign if no match
  if (!selectedCampaign) {
    selectedCampaign = campaigns.find((c) => c.urgency_filter === null);
  }

  if (!selectedCampaign) {
    console.warn('No matching campaign found for lead');
    return;
  }

  // Calculate next send time (first step's delay)
  const firstStep = (selectedCampaign.campaign_steps as unknown as CampaignStep[])?.[0];
  if (!firstStep) {
    console.error('Campaign has no steps');
    return;
  }

  const nextSendAt = new Date(
    Date.now() + firstStep.delay_minutes * 60 * 1000
  ).toISOString();

  // Enroll lead
  const { error: enrollError } = await supabase
    .from('campaign_enrollments')
    .insert({
      lead_id: leadId,
      campaign_id: selectedCampaign.id,
      current_step: 1,
      status: 'active',
      next_send_at: nextSendAt,
    });

  if (enrollError) {
    console.error('Failed to enroll lead:', enrollError);
    return;
  }

  console.log(
    `Lead ${leadId} enrolled in campaign ${selectedCampaign.name}, next send: ${nextSendAt}`
  );
}

/**
 * Send SMS for a campaign step
 */
export async function sendCampaignSMS(
  enrollmentId: string
): Promise<boolean> {
  const supabase = createServerClient();

  // Get enrollment with lead, business, campaign, and step details
  const { data: enrollment, error: enrollError } = await supabase
    .from('campaign_enrollments')
    .select('*, leads!inner(*, businesses(*)), campaigns!inner(*), campaign_steps!inner(*)')
    .eq('id', enrollmentId)
    .single();

  if (enrollError || !enrollment) {
    console.error('Failed to fetch enrollment:', enrollError);
    return false;
  }

  const lead = (enrollment as any).leads as Lead & { businesses: Business };
  const business = lead.businesses;
  const campaign = (enrollment as any).campaigns as Campaign;

  // Get current step
  const steps = (enrollment as any).campaign_steps as CampaignStep[];
  const currentStep = steps.find(
    (s) => s.step_number === enrollment.current_step
  );

  if (!currentStep) {
    console.error(`Step ${enrollment.current_step} not found`);
    return false;
  }

  try {
    // Get template and personalize
    const messageBody = getTemplate(currentStep.template_key, {
      business: business.name,
      name: '', // Could add customer name if we have it
      issue: lead.issue || '',
    });

    // Send SMS
    const message = await sendSMS(lead.caller_phone, business.phone, messageBody);

    // Record SMS
    await supabase.from('sms_messages').insert({
      lead_id: lead.id,
      direction: 'outbound',
      body: messageBody,
      message_sid: message.sid,
      status: message.status,
    });

    // Update enrollment - advance to next step or complete
    const nextStepNumber = enrollment.current_step + 1;
    const nextStep = steps.find((s) => s.step_number === nextStepNumber);

    if (nextStep) {
      // Schedule next step
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
        `Campaign SMS sent, next step ${nextStepNumber} scheduled for ${nextSendAt}`
      );
    } else {
      // Campaign complete
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

    return true;
  } catch (error) {
    console.error('Failed to send campaign SMS:', error);
    return false;
  }
}

/**
 * Pause campaign enrollment (called when lead responds)
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
 * Process all due campaign messages (called by cron)
 */
export async function processDueCampaigns(): Promise<{
  processed: number;
  errors: number;
}> {
  const supabase = createServerClient();

  // Find all enrollments due for sending
  const { data: enrollments, error } = await supabase
    .from('campaign_enrollments')
    .select('id')
    .eq('status', 'active')
    .lte('next_send_at', new Date().toISOString())
    .limit(100); // Process max 100 at a time

  if (error) {
    console.error('Failed to fetch due enrollments:', error);
    return { processed: 0, errors: 0 };
  }

  if (!enrollments || enrollments.length === 0) {
    console.log('No due campaigns to process');
    return { processed: 0, errors: 0 };
  }

  let processed = 0;
  let errors = 0;

  // Process each enrollment
  for (const enrollment of enrollments) {
    const success = await sendCampaignSMS(enrollment.id);
    if (success) {
      processed++;
    } else {
      errors++;
    }

    // Rate limit: small delay between sends
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(
    `Processed ${processed} campaigns, ${errors} errors out of ${enrollments.length} total`
  );

  return { processed, errors };
}
