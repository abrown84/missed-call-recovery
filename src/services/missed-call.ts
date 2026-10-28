import { createServerClient } from '@/lib/supabase';
import { redactPhone } from '@/lib/pii';
import { normalizeToE164 } from '@/lib/phone';
import { sendRecoverySMS } from '@/services/sms';
import {
  SuppressionLookupError,
  isPhoneSuppressed,
} from '@/services/suppressions';

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

/**
 * Record a missed call, create a lead, send recovery SMS, enroll in the
 * Standard (catch-all) campaign skipping step 1 so non-responders still get
 * follow-ups. Urgency-specific campaigns are switched on classified reply.
 */
export async function processMissedCall(
  event: MissedCallEvent
): Promise<MissedCallResult> {
  const supabase = createServerClient();

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
    console.error('Failed to record missed call:', callError.message);
    throw new MissedCallError('Failed to record call', 500);
  }

  const callerE164 = normalizeToE164(event.callerPhone);

  let suppressed = false;
  try {
    suppressed = await isPhoneSuppressed(business.id, callerE164);
  } catch (err) {
    if (err instanceof SuppressionLookupError) {
      // Fail closed: treat as suppressed rather than risk texting an opted-out number.
      console.error('Suppression check failed closed on missed call');
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
      opted_out_at: suppressed ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (leadError) {
    console.error('Failed to create lead:', leadError.message);
    throw new MissedCallError('Failed to create lead', 500);
  }

  if (suppressed) {
    console.log(
      `Skipping recovery SMS; phone suppressed: ${redactPhone(callerE164)}`
    );
    return { missedCallId: missedCall.id, leadId: lead.id };
  }

  // Recovery SMS first so sms_outbound_sid is set before enrollment skips step 1.
  try {
    await sendRecoverySMS(lead.id, business, callerE164);
  } catch (err) {
    console.error(
      'SMS send failed:',
      err instanceof Error ? err.message : 'unknown'
    );
  }

  // Do NOT enroll here — urgency is still null until classification.
  // enrollLeadInCampaign gates on urgency; handleClassifiedReplyEnrollment
  // enrolls/switches after the customer replies and urgency is set.

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
