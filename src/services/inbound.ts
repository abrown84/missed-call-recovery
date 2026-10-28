import {
  inboundAmbiguousReviewPayload,
  inboundQualifiedLeadPayload,
  inboundSmsReceivedPayload,
  stopLeadLookupResult,
} from '@/services/inbound-io-plans';
import { LEAD_LOOKUP_MAX_AGE_DAYS } from '@/services/campaign-logic';
import {
  COL,
  ENV_BRWN_DEFAULT_BUSINESS_PHONE,
  INBOUND_MESSAGE_ID_PREFIX,
  LEAD_SELECT_STAR,
  LEAD_STATUS,
  LEGACY_LEAD_STATUSES,
  OPEN_LEAD_STATUSES,
  TABLE,
} from '@/services/db-strings';
import type { Database } from '@/types/database';
import {
  defaultInboundDeps,
  type InboundDeps,
} from '@/services/inbound-deps';

type Lead = Database['public']['Tables']['leads']['Row'];

const OPT_OUT_SUPPRESS_REASON = 'opt_out';
const INBOUND_BODY_MAX_LEN = 1600;

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
  const body = event.body.slice(0, INBOUND_BODY_MAX_LEN);
  const messageId =
    event.messageId ||
    `${INBOUND_MESSAGE_ID_PREFIX}${deps.clock().getTime()}-${deps.randomSuffix()}`;

  const { data: business, error: bizError } = await supabase
    .from(TABLE.businesses)
    .select(LEAD_SELECT_STAR)
    .eq(COL.phone, event.businessPhone)
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
      // Stryker disable StringLiteral,CallExpression,BlockStatement: log-only (no control flow)
      console.warn(
        'Definite STOP from non-normalizable sender; recording without E.164 suppress',
        deps.redactPhone(event.from)
      );
      // Stryker restore StringLiteral,CallExpression,BlockStatement
    }

    const { data: anyLead } = await supabase
      .from(TABLE.leads)
      .select(COL.id)
      .eq(COL.businessId, business.id)
      .eq(COL.callerPhone, phoneForLookup)
      .order(COL.createdAt, { ascending: false })
      .limit(1)
      .maybeSingle();

    const skipSecondLookup = Boolean(anyLead || phoneForLookup === event.from);
    const shortCircuit = stopLeadLookupResult(anyLead, skipSecondLookup);
    const { data: rawLead } =
      shortCircuit === null
        ? await supabase
            .from(TABLE.leads)
            .select(COL.id)
            .eq(COL.businessId, business.id)
            .eq(COL.callerPhone, event.from)
            .order(COL.createdAt, { ascending: false })
            .limit(1)
            .maybeSingle()
        : shortCircuit;

    const leadId = anyLead?.id || rawLead?.id;

    if (fromE164) {
      await deps.suppressPhoneForBusiness(
        business.id,
        fromE164,
        OPT_OUT_SUPPRESS_REASON
      );
    }

    if (leadId) {
      await deps.markLeadOptedOut(leadId).catch((err) => {
        // Stryker disable StringLiteral,CallExpression,BlockStatement: log-only (no control flow)
        console.error(
          'Failed to mark lead opted out:',
          err instanceof Error ? err.message : 'unknown'
        );
        // Stryker restore StringLiteral,CallExpression,BlockStatement
      });
      await deps.pauseCampaignForLead(leadId).catch(() => undefined);
      await supabase.from(TABLE.smsMessages).insert(
        inboundSmsReceivedPayload({
          leadId,
          body,
          messageSid: messageId,
        })
      );
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
      .from(TABLE.leads)
      .select(COL.id)
      .eq(COL.businessId, business.id)
      .eq(COL.callerPhone, phoneForLookup)
      .order(COL.createdAt, { ascending: false })
      .limit(1)
      .maybeSingle();

    if (anyLead?.id) {
      await supabase
        .from(TABLE.leads)
        .update(
          inboundAmbiguousReviewPayload({
            reason: optOutVerdict.reason,
            flaggedAt: deps.clock().toISOString(),
          })
        )
        .eq(COL.id, anyLead.id);
      await supabase.from(TABLE.smsMessages).insert(
        inboundSmsReceivedPayload({
          leadId: anyLead.id,
          body,
          messageSid: messageId,
        })
      );
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
    .from(TABLE.leads)
    .select(LEAD_SELECT_STAR)
    .eq(COL.businessId, business.id)
    .eq(COL.callerPhone, fromE164)
    .eq(COL.status, LEAD_STATUS.pending)
    .gte(COL.createdAt, cutoff)
    .order(COL.createdAt, { ascending: false })
    .limit(1)
    .maybeSingle();

  let lead: Lead | null = pendingLead;

  if (!lead) {
    const { data: openLead } = await supabase
      .from(TABLE.leads)
      .select(LEAD_SELECT_STAR)
      .eq(COL.businessId, business.id)
      .eq(COL.callerPhone, fromE164)
      .in(COL.status, [...OPEN_LEAD_STATUSES])
      .gte(COL.createdAt, cutoff)
      .order(COL.createdAt, { ascending: false })
      .limit(1)
      .maybeSingle();
    lead = openLead;
  }

  if (!lead && fromE164 !== event.from) {
    const { data: legacy } = await supabase
      .from(TABLE.leads)
      .select(LEAD_SELECT_STAR)
      .eq(COL.businessId, business.id)
      .eq(COL.callerPhone, event.from)
      .in(COL.status, [...LEGACY_LEAD_STATUSES])
      .gte(COL.createdAt, cutoff)
      .order(COL.createdAt, { ascending: false })
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

  await supabase.from(TABLE.smsMessages).insert(
    inboundSmsReceivedPayload({
      leadId: lead.id,
      body,
      messageSid: messageId,
    })
  );

  const classification = await deps.classifyUrgency(body, business.vertical);

  const { error: updateError } = await supabase
    .from(TABLE.leads)
    .update(
      inboundQualifiedLeadPayload({
        urgency: classification.urgency,
        issue: classification.issue ?? null,
        body,
        classifiedAt: deps.clock().toISOString(),
      })
    )
    .eq(COL.id, lead.id);

  if (updateError) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('Failed to update lead:', updateError.message);
    // Stryker restore StringLiteral,CallExpression
  }

  const enrollment = await deps
    .handleClassifiedReplyEnrollment(lead.id, classification.urgency)
    .catch((err) => {
      // Stryker disable StringLiteral,CallExpression,BlockStatement: log-only (no control flow)
      console.error(
        'Enrollment handling failed:',
        err instanceof Error ? err.message : 'unknown'
      );
      // Stryker restore StringLiteral,CallExpression,BlockStatement
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
  const fromEnv = process.env[ENV_BRWN_DEFAULT_BUSINESS_PHONE]?.trim();
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
