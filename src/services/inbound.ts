import { createServerClient } from '@/lib/supabase';
import { redactPhone } from '@/lib/pii';
import { classifyUrgency, isOptOutMessage } from '@/services/classification';
import { escalateLead } from '@/services/escalation';
import {
  handleClassifiedReplyEnrollment,
  pauseCampaignForLead,
} from '@/services/campaigns';
import { markLeadOptedOut } from '@/services/suppressions';
import {
  isLeadWithinLookupAge,
  LEAD_LOOKUP_MAX_AGE_DAYS,
} from '@/services/campaign-logic';
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
      enrollmentAction?: string;
      enrolledCampaign?: string;
    }
  | { status: 'no_lead_found' };

/**
 * Handle an inbound customer SMS (forwarded from the BRWN relay webhook).
 *
 * After classification: switch Standard → Emergency/High when urgency warrants,
 * pause when already on the right campaign, never re-enroll a paused lead.
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

  const cutoff = new Date(
    Date.now() - LEAD_LOOKUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: pendingLead } = await supabase
    .from('leads')
    .select('*')
    .eq('business_id', business.id)
    .eq('caller_phone', event.from)
    .eq('status', 'pending')
    .gte('created_at', cutoff)
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
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lead = openLead;
  }

  if (!lead || !isLeadWithinLookupAge(lead.created_at)) {
    console.error('No recent open lead found for:', redactPhone(event.from));
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

  if (isOptOutMessage(body)) {
    await markLeadOptedOut(lead.id).catch((err) => {
      console.error(
        'Failed to persist opt-out:',
        err instanceof Error ? err.message : 'unknown'
      );
    });
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
      enrollmentAction: 'opt_out',
    };
  }

  const enrollment = await handleClassifiedReplyEnrollment(
    lead.id,
    classification.urgency
  ).catch((err) => {
    console.error(
      'Enrollment handling failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return { action: 'error', campaignName: undefined as string | undefined };
  });

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
    enrollmentAction: enrollment.action,
    enrolledCampaign: enrollment.campaignName,
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
