import { createServerClient } from '@/lib/supabase';

/**
 * Phone-level SMS suppression (STOP / wrong number).
 * Checked before recovery and campaign sends so a later missed call
 * cannot text a number that already opted out.
 */

export async function suppressPhone(
  businessId: string,
  phone: string,
  reason: string
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from('sms_suppressions').upsert(
    {
      business_id: businessId,
      phone,
      reason,
    },
    { onConflict: 'business_id,phone' }
  );

  if (error) {
    console.error('Failed to write sms_suppressions:', error.message);
  }
}

export async function isPhoneSuppressed(
  businessId: string,
  phone: string
): Promise<boolean> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sms_suppressions')
    .select('id')
    .eq('business_id', businessId)
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    console.error('Failed to check sms_suppressions:', error.message);
    return false;
  }
  return Boolean(data);
}

export async function markLeadOptedOut(leadId: string): Promise<void> {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data: lead } = await supabase
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

  if (lead) {
    await suppressPhone(lead.business_id, lead.caller_phone, 'opt_out');
  }
}
