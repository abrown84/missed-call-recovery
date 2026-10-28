import {
  defaultMissedCallDeps,
  type MissedCallDeps,
} from '@/services/missed-call-deps';

export interface MissedCallEvent {
  /** Caller's phone (E.164 preferred). */
  callerPhone: string;
  /** Business line that was called (the device SIM / business.phone). */
  businessPhone: string;
  /** Stable id from the device (used as call_sid uniqueness key). */
  callId: string;
  ringDurationSeconds?: number;
}

export interface MissedCallResult {
  missedCallId: string;
  leadId: string;
}

export type { MissedCallDeps };
export { defaultMissedCallDeps };

/**
 * Record a missed call, create a lead, send recovery SMS, enroll in the
 * Standard (catch-all) campaign skipping step 1 so non-responders still get
 * follow-ups. Urgency-specific campaigns are switched on classified reply.
 */
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
    throw new MissedCallError('Business not found', 404);
  }

  const { data: missedCall, error: callError } = await supabase
    .from('missed_calls')
    .insert({
      business_id: business.id,
      caller_phone: event.callerPhone,
      ring_duration: event.ringDurationSeconds ?? 0,
      call_sid: event.callId,
    })
    .select()
    .single();

  if (callError) {
    if (callError.code === '23505') {
      const { data: existing } = await supabase
        .from('missed_calls')
        .select('id')
        .eq('call_sid', event.callId)
        .single();
      const { data: existingLead } = existing
        ? await supabase
            .from('leads')
            .select('id')
            .eq('missed_call_id', existing.id)
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
    .from('leads')
    .insert({
      business_id: business.id,
      missed_call_id: missedCall.id,
      caller_phone: callerE164,
      status: suppressed ? 'spam' : 'pending',
      opted_out: suppressed,
      opted_out_at: suppressed ? deps.clock().toISOString() : null,
    })
    .select()
    .single();

  if (leadError) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('Failed to create lead:', leadError.message);
    // Stryker restore StringLiteral,CallExpression
    throw new MissedCallError('Failed to create lead', 500);
  }

  if (suppressed) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.log(
      `Skipping recovery SMS; phone suppressed: ${deps.redactPhone(callerE164)}`
    );
    // Stryker restore StringLiteral,CallExpression
    return { missedCallId: missedCall.id, leadId: lead.id };
  }

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
