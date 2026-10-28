import { createServerClient } from '@/lib/supabase';
import { getMessagingAdapter } from '@/lib/messaging';
import { ensureRelayKeySupportProbed } from '@/lib/messaging/brwn-relay';
import { redactPhone } from '@/lib/pii';
import { appendOptOutFooter } from '@/lib/templates';
import {
  isFailedSmsStatus,
  isRelayKeySupportConfirmed,
  recoveryMessageSid,
} from '@/services/sms-sid';
import {
  SuppressionLookupError,
  isPhoneSuppressed,
} from '@/services/suppressions';
import type { Database } from '@/types/database';

type Business = Database['public']['Tables']['businesses']['Row'];

/**
 * SMS Outreach Service
 * Sends recovery SMS via the active messaging adapter (BRWN relay by default).
 */

/** Kept short so body + STOP footer fit one GSM-7 segment. */
const SMS_TEMPLATES: Record<string, string> = {
  plumbing: `Hi, {business} here - we missed your call. What plumbing issue can we help with? Reply or call back.`,
  hvac: `Hi, {business} here - missed your call. Heating/cooling issue? Reply with details and we'll help ASAP.`,
  electrical: `Hi, {business} here - we missed your call. What electrical issue can we help with? Reply anytime.`,
  general: `Hi, this is {business}. Sorry we missed your call! How can we help? Reply or call us back.`,
};

export async function sendRecoverySMS(
  leadId: string,
  business: Business,
  callerPhone: string
): Promise<void> {
  const supabase = createServerClient();

  try {
    if (await isPhoneSuppressed(business.id, callerPhone)) {
      console.log(
        `Skipping recovery SMS; suppressed ${redactPhone(callerPhone)}`
      );
      return;
    }
  } catch (err) {
    if (err instanceof SuppressionLookupError) {
      console.error('Suppression check failed closed; skipping recovery SMS');
      return;
    }
    throw err;
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
  const messageBody = appendOptOutFooter(
    template.replace('{business}', business.name)
  );
  const sid = recoveryMessageSid(leadId);

  // Insert-before-send for recovery too (UNIQUE message_sid).
  // key_supported_at_send set only after caps+echo (see below).
  const { error: insertError } = await supabase.from('sms_messages').insert({
    lead_id: leadId,
    direction: 'outbound',
    body: messageBody,
    message_sid: sid,
    status: 'sending',
    key_supported_at_send: false,
  });

  if (insertError?.code === '23505') {
    console.log(`Recovery SMS already recorded for lead ${leadId}`);
    return;
  }
  if (insertError) {
    throw new Error(`Failed to record recovery SMS: ${insertError.message}`);
  }

  try {
    const adapter = getMessagingAdapter();
    // Caps must be probed *before* the send for key_supported_at_send trust.
    await ensureRelayKeySupportProbed(adapter);

    const message = await adapter.sendMessage({
      to: callerPhone,
      body: messageBody,
      auto: true,
      idempotencyKey: sid,
    });

    if (isRelayKeySupportConfirmed() && message.keyEchoed) {
      await supabase
        .from('sms_messages')
        .update({ key_supported_at_send: true })
        .eq('message_sid', sid);
    }

    if (message.conflict || isFailedSmsStatus(message.status)) {
      console.error(
        `ALERT: recovery SMS failed/conflict for lead ${leadId}; needs_review`
      );
      await supabase
        .from('sms_messages')
        .update({ status: 'needs_review' })
        .eq('message_sid', sid);
      return;
    }

    // 429 on keyed recovery → park as unknown (do not hard-fail the webhook).
    if (message.ambiguous || message.status === 'unknown') {
      await supabase
        .from('sms_messages')
        .update({ status: 'unknown' })
        .eq('message_sid', sid);
      console.warn(
        `Recovery SMS ambiguous for lead ${leadId}; parked for reconcile`
      );
      return;
    }

    await supabase
      .from('sms_messages')
      .update({ status: message.status || 'queued' })
      .eq('message_sid', sid);

    await supabase
      .from('leads')
      .update({ sms_outbound_sid: sid })
      .eq('id', leadId);

    console.log(
      `Recovery SMS queued to ${redactPhone(callerPhone)}, id: ${message.id}` +
        `${message.duplicate ? ' (duplicate)' : ''}`
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

  try {
    if (await isPhoneSuppressed(business.id, callerPhone)) {
      console.log(
        `Skipping follow-up SMS; suppressed ${redactPhone(callerPhone)}`
      );
      return;
    }
  } catch (err) {
    if (err instanceof SuppressionLookupError) {
      console.error('Suppression check failed closed; skipping follow-up SMS');
      return;
    }
    throw err;
  }

  const messageBody = appendOptOutFooter(
    customMessage ||
      `Hi, just following up from ${business.name}. Still need help? Reply here or give us a call!`
  );

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
