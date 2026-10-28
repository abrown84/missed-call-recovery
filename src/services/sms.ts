/**
 * Recovery / follow-up SMS — thin wrappers around the single send module.
 * No direct relay calls.
 */

import { createServerClient } from '@/lib/supabase';
import { appendOptOutFooter } from '@/lib/templates';
import { redactPhone } from '@/lib/pii';
import { sendMessage } from '@/services/send';
import { recoveryMessageSid } from '@/services/sms-sid';
import {
  SuppressionLookupError,
  isPhoneSuppressed,
} from '@/services/suppressions';
import type { Database } from '@/types/database';

type Business = Database['public']['Tables']['businesses']['Row'];

/** Kept short so body + STOP footer fit reasonably. */
const SMS_TEMPLATES: Record<string, string> = {
  plumbing: `Hi, {business} here - we missed your call. What plumbing issue can we help with? Reply or call back.`,
  hvac: `Hi, {business} here - missed your call. Heating/cooling issue? Reply with details and we'll help ASAP.`,
  electrical: `Hi, {business} here - we missed your call. What electrical issue can we help with? Reply anytime.`,
  general: `Hi, this is {business}. Sorry we missed your call! How can we help? Reply or call us back.`,
};

export function buildRecoveryBody(business: Business): string {
  const customTemplate = (business.settings as Record<string, unknown>)
    ?.smsTemplate as string | undefined;
  const template =
    customTemplate || SMS_TEMPLATES[business.vertical] || SMS_TEMPLATES.general;
  return appendOptOutFooter(template.replace('{business}', business.name));
}

/**
 * Persist a quiet-hours-deferred recovery so cron can send when the window opens.
 * Never drop — Defer, don't discard (quiet-hours docstring + QC r6 P0).
 */
export async function persistDeferredRecovery(opts: {
  leadId: string;
  body: string;
  nextSendAt: string;
}): Promise<void> {
  const supabase = createServerClient();
  const sid = recoveryMessageSid(opts.leadId);
  const { data: existing } = await supabase
    .from('sms_messages')
    .select('id, status')
    .eq('message_sid', sid)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('sms_messages')
      .update({
        status: 'deferred',
        next_retry_at: opts.nextSendAt,
        body: opts.body,
      })
      .eq('message_sid', sid);
  } else {
    const { error } = await supabase.from('sms_messages').insert({
      lead_id: opts.leadId,
      direction: 'outbound',
      body: opts.body,
      message_sid: sid,
      status: 'deferred',
      next_retry_at: opts.nextSendAt,
      key_supported_at_send: false,
    });
    if (error && error.code !== '23505') {
      console.error('persistDeferredRecovery insert failed:', error.message);
    }
    if (error?.code === '23505') {
      await supabase
        .from('sms_messages')
        .update({
          status: 'deferred',
          next_retry_at: opts.nextSendAt,
          body: opts.body,
        })
        .eq('message_sid', sid);
    }
  }
}

export async function sendRecoverySMS(
  leadId: string,
  business: Business,
  callerPhone: string
): Promise<void> {
  const messageBody = buildRecoveryBody(business);

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

  if (outcome.kind === 'blocked' && outcome.reason === 'quiet_hours_deferred') {
    const nextSendAt =
      outcome.nextSendAt ??
      new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await persistDeferredRecovery({
      leadId,
      body: messageBody,
      nextSendAt,
    });
    console.log(
      `Recovery SMS deferred for ${redactPhone(callerPhone)} until ${nextSendAt}`
    );
    return;
  }

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

/**
 * Cron: send recoveries whose quiet-hours deferral window has opened.
 */
export async function processDeferredRecoveries(): Promise<{
  sent: number;
  deferred: number;
  errors: number;
}> {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('sms_messages')
    .select('id, lead_id, message_sid, body, next_retry_at')
    .eq('status', 'deferred')
    .lte('next_retry_at', nowIso)
    .limit(50);

  if (error) {
    console.error('processDeferredRecoveries query failed:', error.message);
    return { sent: 0, deferred: 0, errors: 1 };
  }

  let sent = 0;
  let deferred = 0;
  let errors = 0;

  for (const row of rows ?? []) {
    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('*, businesses(*)')
        .eq('id', row.lead_id)
        .single();
      if (!lead?.businesses) {
        errors += 1;
        continue;
      }
      const business = lead.businesses as unknown as Business;
      const outcome = await sendMessage({
        kind: 'recovery',
        leadId: lead.id,
        businessId: business.id,
        to: lead.caller_phone,
        body: row.body || buildRecoveryBody(business),
        idempotencyKey: recoveryMessageSid(lead.id),
        businessTimezone: business.timezone,
        skipQuietHours: false,
      });

      if (outcome.kind === 'blocked' && outcome.reason === 'quiet_hours_deferred') {
        await persistDeferredRecovery({
          leadId: lead.id,
          body: row.body || buildRecoveryBody(business),
          nextSendAt:
            outcome.nextSendAt ??
            new Date(Date.now() + 8 * 3600_000).toISOString(),
        });
        deferred += 1;
        continue;
      }
      if (outcome.kind === 'sent') {
        sent += 1;
        continue;
      }
      if (outcome.kind === 'blocked' || outcome.kind === 'skipped') {
        // Mark abandoned so we don't loop forever on suppressed/opted_out
        await supabase
          .from('sms_messages')
          .update({ status: 'abandoned_done', next_retry_at: null })
          .eq('id', row.id);
        continue;
      }
      if (outcome.kind === 'ambiguous' || outcome.kind === 'needs_review') {
        // Row already updated by sendMessage insert path; clear deferred
        deferred += 1;
      }
    } catch (err) {
      console.error(
        'processDeferredRecoveries row failed:',
        err instanceof Error ? err.message : 'unknown'
      );
      errors += 1;
    }
  }

  return { sent, deferred, errors };
}

export async function sendFollowUpSMS(
  leadId: string,
  business: Business,
  callerPhone: string,
  customMessage?: string
): Promise<void> {
  // Restore suppression / opt-out checks (QC r6 P2) — kind manual skips
  // quiet hours but must not bypass TCPA revocation.
  try {
    if (await isPhoneSuppressed(business.id, callerPhone)) {
      console.log(
        `Skipping follow-up; phone suppressed: ${redactPhone(callerPhone)}`
      );
      return;
    }
  } catch (err) {
    if (err instanceof SuppressionLookupError) {
      console.log(
        `Skipping follow-up; suppression lookup failed closed: ${redactPhone(callerPhone)}`
      );
      return;
    }
    throw err;
  }

  const supabase = createServerClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('opted_out')
    .eq('id', leadId)
    .maybeSingle();
  if (lead?.opted_out) {
    console.log(
      `Skipping follow-up; lead opted out: ${redactPhone(callerPhone)}`
    );
    return;
  }

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
    await supabase.from('sms_messages').insert({
      lead_id: leadId,
      direction: 'outbound',
      body: messageBody,
      message_sid: outcome.sid,
      status: outcome.providerStatus,
    });
  }
}
