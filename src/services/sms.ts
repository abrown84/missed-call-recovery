/**
 * Recovery / follow-up SMS — thin wrappers around the single send module.
 * No direct relay calls.
 */

import { createServerClient } from '@/lib/supabase';
import { appendOptOutFooter } from '@/lib/templates';
import { redactPhone } from '@/lib/pii';
import { sendMessage } from '@/services/send';
import { recoveryMessageSid } from '@/services/sms-sid';
import type { Database } from '@/types/database';

type Business = Database['public']['Tables']['businesses']['Row'];

/** Kept short so body + STOP footer fit reasonably. */
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
  const customTemplate = (business.settings as Record<string, unknown>)
    ?.smsTemplate as string | undefined;
  const template =
    customTemplate || SMS_TEMPLATES[business.vertical] || SMS_TEMPLATES.general;
  const messageBody = appendOptOutFooter(
    template.replace('{business}', business.name)
  );

  // Quiet hours apply to recovery too (47 CFR 64.1200(c)(1) solicitation
  // window). Flag for Alex: a direct reply to an inbound missed call may be
  // informational rather than a "telephone solicitation" — confirm before
  // relaxing this gate. See CAMPAIGNS.md / PR body.
  const outcome = await sendMessage({
    kind: 'recovery',
    leadId,
    businessId: business.id,
    to: callerPhone,
    body: messageBody,
    idempotencyKey: recoveryMessageSid(leadId),
    businessTimezone: business.timezone,
    skipQuietHours: false,
  });

  if (outcome.kind === 'blocked' || outcome.kind === 'skipped') {
    console.log(
      `Recovery SMS ${outcome.kind} for ${redactPhone(callerPhone)}: ${
        'reason' in outcome ? outcome.reason : ''
      }`
    );
    return;
  }
  if (outcome.kind === 'needs_review') {
    console.error(`ALERT: recovery SMS needs_review sid=${outcome.sid}`);
    return;
  }
  if (outcome.kind === 'ambiguous') {
    console.warn(
      `Recovery SMS ambiguous for ${redactPhone(callerPhone)}; parked (${outcome.reason})`
    );
    return;
  }
  console.log(
    `Recovery SMS queued to ${redactPhone(callerPhone)} sid=${outcome.sid}`
  );
}

export async function sendFollowUpSMS(
  leadId: string,
  business: Business,
  callerPhone: string,
  customMessage?: string
): Promise<void> {
  const messageBody = appendOptOutFooter(
    customMessage ||
      `Hi, this is ${business.name}. Just following up on your recent inquiry. How can we help?`
  );

  const outcome = await sendMessage({
    kind: 'manual',
    leadId,
    businessId: business.id,
    to: callerPhone,
    body: messageBody,
    businessTimezone: business.timezone,
    skipQuietHours: true,
  });

  if (outcome.kind === 'sent') {
    const supabase = createServerClient();
    await supabase.from('sms_messages').insert({
      lead_id: leadId,
      direction: 'outbound',
      body: messageBody,
      message_sid: outcome.sid,
      status: outcome.providerStatus,
    });
  }
}
