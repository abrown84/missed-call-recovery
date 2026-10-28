import { createServerClient } from '@/lib/supabase';
import { normalizeToE164 } from '@/lib/phone';

/**
 * Phone-level SMS suppression (STOP / wrong number).
 * Fail-closed on DB errors: better to skip a send than text an opted-out number.
 * Phones are normalized to E.164 on write and lookup.
 */

export class SuppressionLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuppressionLookupError';
  }
}

export async function suppressPhone(
  businessId: string,
  phone: string,
  reason: string
): Promise<void> {
  const normalized = normalizeToE164(phone);
  const supabase = createServerClient();
  const { error } = await supabase.from('sms_suppressions').upsert(
    {
      business_id: businessId,
      phone: normalized,
      reason,
    },
    { onConflict: 'business_id,phone' }
  );

  if (error) {
    throw new SuppressionLookupError(
      `Failed to write sms_suppressions: ${error.message}`
    );
  }
}

/**
 * Returns true if suppressed. Throws SuppressionLookupError on DB failure
 * (fail-closed — callers must treat throw as "do not send").
 */
export async function isPhoneSuppressed(
  businessId: string,
  phone: string
): Promise<boolean> {
  const normalized = normalizeToE164(phone);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sms_suppressions')
    .select('id')
    .eq('business_id', businessId)
    .eq('phone', normalized)
    .maybeSingle();

  if (error) {
    throw new SuppressionLookupError(
      `Failed to check sms_suppressions: ${error.message}`
    );
  }
  return Boolean(data);
}

/**
 * Persist opt-out for a lead and suppress the phone for the business.
 * If no lead row, still suppress by businessId + phone.
 */
export async function markLeadOptedOut(leadId: string): Promise<void> {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data: lead, error } = await supabase
    .from('leads')
    .update({
      opted_out: true,
      opted_out_at: now,
      status: 'spam',
      updated_at: now,
    })
    .eq('id', leadId)
    .select('business_id, caller_phone')
    .maybeSingle();

  if (error) {
    throw new SuppressionLookupError(
      `Failed to mark lead opted out: ${error.message}`
    );
  }

  if (lead) {
    await suppressPhone(lead.business_id, lead.caller_phone, 'opt_out');
  }
}

/** Suppress by business + phone even when no lead row exists (e.g. STOP after 7d). */
export async function suppressPhoneForBusiness(
  businessId: string,
  phone: string,
  reason = 'opt_out'
): Promise<void> {
  await suppressPhone(businessId, phone, reason);
}
