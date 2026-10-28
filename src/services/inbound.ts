import { LEAD_LOOKUP_MAX_AGE_DAYS } from '@/services/campaign-logic';
import type { Database } from '@/types/database';
import {
  defaultInboundDeps,
  type InboundDeps,
} from '@/services/inbound-deps';

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

export type { InboundDeps };
export { defaultInboundDeps };

/**
 * Handle an inbound customer SMS (forwarded from the BRWN relay webhook).
 * STOP is handled before the age-limited lead lookup so a late opt-out
 * still suppresses the number. Phone normalize must not throw before STOP.
 */
export async function processInboundSms(
  event: InboundSmsEvent
): Promise<InboundResult> {
  return processInboundSmsWithDeps(defaultInboundDeps(), event);
}

export async function processInboundSmsWithDeps(
  deps: InboundDeps,
  event: InboundSmsEvent
): Promise<InboundResult> {
  const supabase = deps.db();
  const body = event.body.slice(0, 1600);
  const messageId =
    event.messageId ||
    `brwn-in-${deps.clock().getTime()}-${deps.randomSuffix()}`;

  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('*')
    .eq('phone', event.businessPhone)
    .single();

  if (bizError || !business) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error(
      'Business not found for number:',
      deps.redactPhone(event.businessPhone)
    );
    // Stryker restore StringLiteral,CallExpression
    throw new InboundError('Business not found', 404);
  }

  const fromE164 = deps.tryNormalizeToE164(event.from);
  const phoneForLookup = fromE164 || event.from.trim();

  const optOutVerdict = deps.classifyOptOut(body);

  if (optOutVerdict.kind === 'opt_out' || deps.isOptOutMessage(body)) {
    if (!fromE164) {
      // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
      console.warn(
        'Definite STOP from non-normalizable sender; recording without E.164 suppress',
        deps.redactPhone(event.from)
      );
      // Stryker restore StringLiteral,CallExpression
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
      await deps.suppressPhoneForBusiness(business.id, fromE164, 'opt_out');
    }

    if (leadId) {
      await deps.markLeadOptedOut(leadId).catch((err) => {
        // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
        console.error(
          'Failed to mark lead opted out:',
          err instanceof Error ? err.message : 'unknown'
        );
        // Stryker restore StringLiteral,CallExpression
      });
      await deps.pauseCampaignForLead(leadId).catch(() => undefined);
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
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.warn(
      `Ambiguous opt-out language from ${deps.redactPhone(event.from)}: needs_human_review`
    );
    // Stryker restore StringLiteral,CallExpression
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
          needs_human_review_at: deps.clock().toISOString(),
          needs_human_review_reason: optOutVerdict.reason,
          updated_at: deps.clock().toISOString(),
        })
        .eq('id', anyLead.id);
      await supabase.from('sms_messages').insert({
        lead_id: anyLead.id,
        direction: 'inbound',
        body,
        message_sid: messageId,
        status: 'received',
      });
      return { status: 'ambiguous_opt_out', leadId: anyLead.id };
    }
    return { status: 'ambiguous_opt_out' };
  }

  if (!fromE164) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('Invalid sender phone for inbound:', deps.redactPhone(event.from));
    // Stryker restore StringLiteral,CallExpression
    return { status: 'no_lead_found' };
  }

  const cutoff = new Date(
    deps.clock().getTime() - LEAD_LOOKUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
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

  if (!lead || !deps.isLeadWithinLookupAge(lead.created_at, deps.clock())) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('No recent open lead found for:', deps.redactPhone(event.from));
    // Stryker restore StringLiteral,CallExpression
    return { status: 'no_lead_found' };
  }

  await supabase.from('sms_messages').insert({
    lead_id: lead.id,
    direction: 'inbound',
    body,
    message_sid: messageId,
    status: 'received',
  });

  const classification = await deps.classifyUrgency(body, business.vertical);

  const { error: updateError } = await supabase
    .from('leads')
    .update({
      status: 'qualified',
      urgency: classification.urgency,
      issue: classification.issue,
      sms_response_text: body,
      classified_at: deps.clock().toISOString(),
    })
    .eq('id', lead.id);

  if (updateError) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('Failed to update lead:', updateError.message);
    // Stryker restore StringLiteral,CallExpression
  }

  const enrollment = await deps
    .handleClassifiedReplyEnrollment(lead.id, classification.urgency)
    .catch((err) => {
      // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
      console.error(
        'Enrollment handling failed:',
        err instanceof Error ? err.message : 'unknown'
      );
      // Stryker restore StringLiteral,CallExpression
      return { action: 'error', campaignName: undefined as string | undefined };
    });

  if (
    classification.urgency === 'emergency' ||
    classification.urgency === 'high'
  ) {
    await deps.escalateLead(lead.id, business, classification);
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
