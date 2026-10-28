import {
  missedCallLeadPayload,
  missedCallRowPayload,
} from '@/services/missed-call-io-plans';
import {
  COL,
  PG_UNIQUE,
  TABLE,
} from '@/services/db-strings';
import {
  defaultMissedCallDeps,
  type MissedCallDeps,
} from '@/services/missed-call-deps';

export interface MissedCallEvent {
  callerPhone: string;
  businessPhone: string;
  callId: string;
  ringDurationSeconds?: number;
}

export interface MissedCallResult {
  missedCallId: string;
  leadId: string;
}

export type { MissedCallDeps };
export { defaultMissedCallDeps };

export async function processMissedCall(
  event: MissedCallEvent
): Promise<MissedCallResult> {
  return processMissedCallWithDeps(defaultMissedCallDeps(), event);
}

export async function processMissedCallWithDeps(
  deps: MissedCallDeps,
  event: MissedCallEvent
): Promise<MissedCallResult> {
  const supabase = deps.db();

  const { data: business, error: bizError } = await supabase
    .from(TABLE.businesses)
    .select('*')
    .eq(COL.phone, event.businessPhone)
    .single();

  if (bizError || !business) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error(
      'Business not found for number:',
      deps.redactPhone(event.businessPhone)
    );
    // Stryker restore StringLiteral,CallExpression
    throw new MissedCallError('Business not found', 404);
  }

  const { data: missedCall, error: callError } = await supabase
    .from(TABLE.missedCalls)
    .insert(
      missedCallRowPayload({
        businessId: business.id,
        callerPhone: event.callerPhone,
        ringDuration: event.ringDurationSeconds ?? 0,
        callSid: event.callId,
      })
    )
    .select()
    .single();

  if (callError) {
    if (callError.code === PG_UNIQUE) {
      const { data: existing } = await supabase
        .from(TABLE.missedCalls)
        .select(COL.id)
        .eq(COL.callSid, event.callId)
        .single();
      const { data: existingLead } = existing
        ? await supabase
            .from(TABLE.leads)
            .select(COL.id)
            .eq(COL.missedCallId, existing.id)
            .single()
        : { data: null };
      if (existing && existingLead) {
        return { missedCallId: existing.id, leadId: existingLead.id };
      }
    }
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('Failed to record missed call:', callError.message);
    // Stryker restore StringLiteral,CallExpression
    throw new MissedCallError('Failed to record call', 500);
  }

  const callerE164 = deps.normalizeToE164(event.callerPhone);

  let suppressed = false;
  try {
    suppressed = await deps.isPhoneSuppressed(business.id, callerE164);
  } catch (err) {
    if (err instanceof deps.SuppressionLookupError) {
      // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
      console.error('Suppression check failed closed on missed call');
      // Stryker restore StringLiteral,CallExpression
      suppressed = true;
    } else {
      throw err;
    }
  }

  const { data: lead, error: leadError } = await supabase
    .from(TABLE.leads)
    .insert(
      missedCallLeadPayload({
        businessId: business.id,
        missedCallId: missedCall.id,
        callerE164,
        suppressed,
        optedOutAt: suppressed ? deps.clock().toISOString() : null,
      })
    )
    .select()
    .single();

  if (leadError) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('Failed to create lead:', leadError.message);
    // Stryker restore StringLiteral,CallExpression
    throw new MissedCallError('Failed to create lead', 500);
  }

  if (suppressed) {
    // Stryker disable StringLiteral,CallExpression,BlockStatement: log-only (no control flow)
    console.log(
      `Skipping recovery SMS; phone suppressed: ${deps.redactPhone(callerE164)}`
    );
    // Stryker restore StringLiteral,CallExpression,BlockStatement
    return { missedCallId: missedCall.id, leadId: lead.id };
  }

  // Stryker disable BlockStatement: empty catch is intentional — recovery failure must not block enroll attempt
  try {
    await deps.sendRecoverySMS(lead.id, business, callerE164);
  } catch (err) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error(
      'SMS send failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    // Stryker restore StringLiteral,CallExpression
  }
  // Stryker restore BlockStatement

  // Stryker disable BlockStatement: empty catch is intentional — enroll failure must not fail webhook
  try {
    await deps.enrollLeadInCampaign(lead.id);
  } catch (err) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error(
      'Enrollment failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    // Stryker restore StringLiteral,CallExpression
  }
  // Stryker restore BlockStatement

  return { missedCallId: missedCall.id, leadId: lead.id };
}

export class MissedCallError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'MissedCallError';
  }
}
