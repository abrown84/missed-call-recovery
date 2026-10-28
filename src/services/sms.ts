import { createServerClient } from '@/lib/supabase';
import { getMessagingAdapter } from '@/lib/messaging';
import { redactPhone } from '@/lib/pii';
import { isPhoneSuppressed } from '@/services/suppressions';
import type { Database } from '@/types/database';

type Business = Database['public']['Tables']['businesses']['Row'];

/**
 * SMS Outreach Service
 * Sends recovery SMS via the active messaging adapter (BRWN relay by default).
 */

const SMS_TEMPLATES: Record<string, string> = {
  plumbing: `Hi, this is {business}. We noticed we missed your call. What plumbing issue can we help you with today? Reply here or call us back!`,
  hvac: `Hi, this is {business}. Sorry we missed your call! Are you having a heating/cooling issue? Reply with details and we'll get back to you ASAP.`,
  electrical: `Hi, this is {business}. We missed your call - what electrical issue can we help with? Reply here and we'll respond quickly!`,
  general: `Hi, this is {business}. Sorry we missed your call! How can we help you today? Reply here or call us back.`,
};

function recoveryMessageSid(leadId: string): string {
  return `recovery:${leadId}`;
}

export async function sendRecoverySMS(
  leadId: string,
  business: Business,
  callerPhone: string
): Promise<void> {
  const supabase = createServerClient();

  if (await isPhoneSuppressed(business.id, callerPhone)) {
    console.log(
      `Skipping recovery SMS; suppressed ${redactPhone(callerPhone)}`
    );
    return;
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('opted_out')
    .eq('id', leadId)
    .maybeSingle();

  if (lead?.opted_out) {
    console.log(`Skipping recovery SMS; lead ${leadId} opted out`);
    return;
  }

  const customTemplate = (business.settings as Record<string, unknown>)
    ?.smsTemplate as string | undefined;
  const template =
    customTemplate || SMS_TEMPLATES[business.vertical] || SMS_TEMPLATES.general;
  const messageBody = template.replace('{business}', business.name);
  const sid = recoveryMessageSid(leadId);

  // Insert-before-send for recovery too (UNIQUE message_sid).
  const { error: insertError } = await supabase.from('sms_messages').insert({
    lead_id: leadId,
    direction: 'outbound',
    body: messageBody,
    message_sid: sid,
    status: 'sending',
  });

  if (insertError?.code === '23505') {
    console.log(`Recovery SMS already recorded for lead ${leadId}`);
    return;
  }
  if (insertError) {
    throw new Error(`Failed to record recovery SMS: ${insertError.message}`);
  }

  try {
    const message = await getMessagingAdapter().sendMessage({
      to: callerPhone,
      body: messageBody,
      auto: true,
      idempotencyKey: sid,
    });

    await supabase
      .from('sms_messages')
      .update({ status: message.status || 'queued' })
      .eq('message_sid', sid);

    await supabase
      .from('leads')
      .update({ sms_outbound_sid: sid })
      .eq('id', leadId);

    console.log(
      `Recovery SMS queued to ${redactPhone(callerPhone)}, id: ${message.id}`
    );
  } catch (error) {
    await supabase
      .from('sms_messages')
      .update({ status: 'unknown' })
      .eq('message_sid', sid);
    console.error(
      'Failed to send recovery SMS:',
      error instanceof Error ? error.message : 'unknown'
    );
    throw error;
  }
}

export async function sendFollowUpSMS(
  leadId: string,
  business: Business,
  callerPhone: string,
  customMessage?: string
): Promise<void> {
  const supabase = createServerClient();

  if (await isPhoneSuppressed(business.id, callerPhone)) {
    console.log(
      `Skipping follow-up SMS; suppressed ${redactPhone(callerPhone)}`
    );
    return;
  }

  const messageBody =
    customMessage ||
    `Hi, just following up from ${business.name}. Still need help? Reply here or give us a call!`;

  try {
    const message = await getMessagingAdapter().sendMessage({
      to: callerPhone,
      body: messageBody,
      auto: true,
    });

    await supabase.from('sms_messages').insert({
      lead_id: leadId,
      direction: 'outbound',
      body: messageBody,
      message_sid: message.id,
      status: message.status,
    });

    console.log(
      `Follow-up SMS queued to ${redactPhone(callerPhone)}, id: ${message.id}`
    );
  } catch (error) {
    console.error(
      'Failed to send follow-up SMS:',
      error instanceof Error ? error.message : 'unknown'
    );
    throw error;
  }
}
