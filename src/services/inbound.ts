import { createServerClient } from '@/lib/supabase';
import { redactPhone } from '@/lib/pii';
import { classifyUrgency, isOptOutMessage } from '@/services/classification';
import { escalateLead } from '@/services/escalation';
import {
  enrollLeadInCampaign,
  leadHasActiveEnrollment,
  pauseCampaignForLead,
} from '@/services/campaigns';
import type { Database } from '@/types/database';

type Lead = Database['public']['Tables']['leads']['Row'];

export interface InboundSmsEvent {
  from: string;
  body: string;
  /** Business line that received the reply (device SIM). */
  businessPhone: string;
  messageId?: string;
}

export type InboundResult =
  | {
      status: 'processed';
      leadId: string;
      urgency: string;
      enrolledCampaign?: string;
    }
  | { status: 'no_lead_found' };

/**
 * Handle an inbound customer SMS (forwarded from the BRWN relay webhook).
 *
 * Urgency is classified first; then the lead is enrolled in the matching
 * campaign (Emergency / High / Standard). Later replies pause the campaign.
 */
export async function processInboundSms(
  event: InboundSmsEvent
): Promise<InboundResult> {
  const supabase = createServerClient();
  const body = event.body.slice(0, 1600);
  const messageId =
    event.messageId ||
    `brwn-in-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('*')
    .eq('phone', event.businessPhone)
    .single();

  if (bizError || !business) {
    console.error(
      'Business not found for number:',
      redactPhone(event.businessPhone)
    );
    throw new InboundError('Business not found', 404);
  }

  // Prefer an open pending lead; otherwise a recently qualified one that may
  // still be in an active campaign (so a later reply can pause follow-ups).
  const { data: pendingLead } = await supabase
    .from('leads')
    .select('*')
    .eq('business_id', business.id)
    .eq('caller_phone', event.from)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let lead: Lead | null = pendingLead;

  if (!lead) {
    const { data: openLead } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', business.id)
      .eq('caller_phone', event.from)
      .in('status', ['qualified', 'escalated'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lead = openLead;
  }

  if (!lead) {
    console.error('No open lead found for:', redactPhone(event.from));
    return { status: 'no_lead_found' };
  }

  await supabase.from('sms_messages').insert({
    lead_id: lead.id,
    direction: 'inbound',
    body,
    message_sid: messageId,
    status: 'received',
  });

  const classification = await classifyUrgency(body, business.vertical);

  const { error: updateError } = await supabase
    .from('leads')
    .update({
      status: 'qualified',
      urgency: classification.urgency,
      issue: classification.issue,
      sms_response_text: body,
      classified_at: new Date().toISOString(),
    })
    .eq('id', lead.id);

  if (updateError) {
    console.error('Failed to update lead:', updateError.message);
  }

  // Opt-out: stop outreach, do not enroll.
  if (isOptOutMessage(body)) {
    await pauseCampaignForLead(lead.id).catch((err) => {
      console.error(
        'Failed to pause campaign on opt-out:',
        err instanceof Error ? err.message : 'unknown'
      );
    });
    return {
      status: 'processed',
      leadId: lead.id,
      urgency: classification.urgency,
    };
  }

  // Later replies while a campaign is running → pause.
  // First classified reply → enroll now that urgency is known.
  const alreadyEnrolled = await leadHasActiveEnrollment(lead.id);
  let enrolledCampaign: string | undefined;

  if (alreadyEnrolled) {
    await pauseCampaignForLead(lead.id).catch((err) => {
      console.error(
        'Failed to pause campaign:',
        err instanceof Error ? err.message : 'unknown'
      );
    });
  } else {
    const enrollment = await enrollLeadInCampaign(lead.id).catch((err) => {
      console.error(
        'Campaign enrollment failed:',
        err instanceof Error ? err.message : 'unknown'
      );
      return null;
    });
    if (enrollment?.enrolled) {
      enrolledCampaign = enrollment.campaignName;
    }
  }

  if (
    classification.urgency === 'emergency' ||
    classification.urgency === 'high'
  ) {
    await escalateLead(lead.id, business, classification);
  }

  return {
    status: 'processed',
    leadId: lead.id,
    urgency: classification.urgency,
    enrolledCampaign,
  };
}

/**
 * Resolve which business phone an inbound webhook applies to.
 * Prefers explicit payload field, then BRWN_DEFAULT_BUSINESS_PHONE.
 */
export function resolveBusinessPhone(
  payloadTo: string | undefined | null
): string | null {
  const fromPayload = payloadTo?.trim();
  if (fromPayload) return fromPayload;
  const fromEnv = process.env.BRWN_DEFAULT_BUSINESS_PHONE?.trim();
  return fromEnv || null;
}

export class InboundError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'InboundError';
  }
}
