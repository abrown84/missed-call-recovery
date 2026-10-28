import { createServerClient } from '@/lib/supabase';
import { redactPhone } from '@/lib/pii';
import { tryNormalizeToE164 } from '@/lib/phone';
import { classifyUrgency, isOptOutMessage } from '@/services/classification';
import { classifyOptOut } from '@/services/opt-out';
import { escalateLead } from '@/services/escalation';
import {
  handleClassifiedReplyEnrollment,
  pauseCampaignForLead,
} from '@/services/campaigns';
import {
  markLeadOptedOut,
  suppressPhoneForBusiness,
} from '@/services/suppressions';
import {
  isLeadWithinLookupAge,
  LEAD_LOOKUP_MAX_AGE_DAYS,
} from '@/services/campaign-logic';
import type { Database } from '@/types/database';

type Lead = Database['public']['Tables']['leads']['Row'];

export interface InboundSmsEvent {
  from: string;
  body: string;
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
  | { status: 'opt_out_recorded'; leadId?: string }
  | { status: 'ambiguous_opt_out'; leadId?: string }
  | { status: 'no_lead_found' };

/**
 * Handle an inbound customer SMS (forwarded from the BRWN relay webhook).
 * STOP is handled before the age-limited lead lookup so a late opt-out
 * still suppresses the number. Phone normalize must not throw before STOP.
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

  // Never throw on bad sender before STOP check (QC: non-numeric sender).
  const fromE164 = tryNormalizeToE164(event.from);
  const phoneForLookup = fromE164 || event.from.trim();

  const optOutVerdict = classifyOptOut(body);

  // Opt-out FIRST — before age-limited lead lookup — so STOP after 7 days
  // still suppresses the number for this business.
  if (optOutVerdict.kind === 'opt_out' || isOptOutMessage(body)) {
    if (!fromE164) {
      console.warn(
        'Definite STOP from non-normalizable sender; recording without E.164 suppress',
        redactPhone(event.from)
      );
    }

    const { data: anyLead } = await supabase
      .from('leads')
      .select('id')
      .eq('business_id', business.id)
      .eq('caller_phone', phoneForLookup)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: rawLead } =
      anyLead || phoneForLookup === event.from
        ? { data: anyLead }
        : await supabase
            .from('leads')
            .select('id')
            .eq('business_id', business.id)
            .eq('caller_phone', event.from)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

    const leadId = anyLead?.id || rawLead?.id;

    if (fromE164) {
      await suppressPhoneForBusiness(business.id, fromE164, 'opt_out');
    }

    if (leadId) {
      await markLeadOptedOut(leadId).catch((err) => {
        console.error(
          'Failed to mark lead opted out:',
          err instanceof Error ? err.message : 'unknown'
        );
      });
      await pauseCampaignForLead(leadId).catch(() => undefined);
      await supabase.from('sms_messages').insert({
        lead_id: leadId,
        direction: 'inbound',
        body,
        message_sid: messageId,
        status: 'received',
      });
      return {
        status: 'opt_out_recorded',
        leadId,
      };
    }

    return { status: 'opt_out_recorded' };
  }

  if (optOutVerdict.kind === 'ambiguous') {
    // Persist human-review flag and pause — do not auto-suppress.
    console.warn(
      `Ambiguous opt-out language from ${redactPhone(event.from)}: needs_human_review`
    );
    const { data: anyLead } = await supabase
      .from('leads')
      .select('id')
      .eq('business_id', business.id)
      .eq('caller_phone', phoneForLookup)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (anyLead?.id) {
      await supabase
        .from('leads')
        .update({
          needs_human_review: true,
          needs_human_review_at: new Date().toISOString(),
          needs_human_review_reason: optOutVerdict.reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', anyLead.id);
      await supabase.from('sms_messages').insert({
        lead_id: anyLead.id,
        direction: 'inbound',
        body,
        message_sid: messageId,
        status: 'received',
      });
      await pauseCampaignForLead(anyLead.id).catch(() => undefined);
      return { status: 'ambiguous_opt_out', leadId: anyLead.id };
    }
    return { status: 'ambiguous_opt_out' };
  }

  if (!fromE164) {
    console.error('Invalid sender phone for inbound:', redactPhone(event.from));
    return { status: 'no_lead_found' };
  }

  const cutoff = new Date(
    Date.now() - LEAD_LOOKUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: pendingLead } = await supabase
    .from('leads')
    .select('*')
    .eq('business_id', business.id)
    .eq('caller_phone', fromE164)
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
      .eq('caller_phone', fromE164)
      .in('status', ['qualified', 'escalated'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lead = openLead;
  }

  // Fallback: un-normalized stored phone
  if (!lead && fromE164 !== event.from) {
    const { data: legacy } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', business.id)
      .eq('caller_phone', event.from)
      .in('status', ['pending', 'qualified', 'escalated'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lead = legacy;
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
