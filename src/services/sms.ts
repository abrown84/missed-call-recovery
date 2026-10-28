/**
 * Recovery / follow-up SMS — thin DI wrappers around the single send module.
 * Decisions in send/decisions; this file only does I/O + templates.
 */

import { createServerClient } from '@/lib/supabase';
import { appendOptOutFooter } from '@/lib/templates';
import { redactPhone } from '@/lib/pii';
import { sendMessage, type SendOutcome } from '@/services/send';
import {
  interpretDeferredRowOutcome,
  interpretRecoverySendOutcome,
} from '@/services/send/decisions';
import { recoveryMessageSid } from '@/services/sms-sid';
import {
  SuppressionLookupError,
  isPhoneSuppressed,
} from '@/services/suppressions';
import {
  COL,
  DIRECTION_OUTBOUND,
  KIND_MANUAL,
  KIND_RECOVERY,
  LEAD_SELECT_OPTED_OUT,
  LEAD_SELECT_STAR_BIZ,
  PG_UNIQUE,
  SMS_SELECT_DEFERRED,
  SMS_SELECT_ID_STATUS,
  SMS_STATUS,
  TABLE,
} from '@/services/db-strings';
import type { Database } from '@/types/database';

type Business = Database['public']['Tables']['businesses']['Row'];
type Supabase = ReturnType<typeof createServerClient>;

export type SmsLogger = {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

/** Kept short so body + STOP footer fit reasonably. */
export const SMS_TEMPLATES: Record<string, string> = {
  plumbing: `Hi, {business} here - we missed your call. What plumbing issue can we help with? Reply or call back.`,
  hvac: `Hi, {business} here - missed your call. Heating/cooling issue? Reply with details and we'll help ASAP.`,
  electrical: `Hi, {business} here - we missed your call. What electrical issue can we help with? Reply anytime.`,
  general: `Hi, this is {business}. Sorry we missed your call! How can we help? Reply or call us back.`,
};

export type SmsDeps = {
  db: () => Supabase;
  clock: () => Date;
  sendMessage: (req: Parameters<typeof sendMessage>[0]) => Promise<SendOutcome>;
  isPhoneSuppressed: (
    businessId: string,
    phone: string
  ) => Promise<boolean>;
  SuppressionLookupError: typeof SuppressionLookupError;
  log: SmsLogger;
};

export function defaultSmsDeps(): SmsDeps {
  return {
    db: () => createServerClient(),
    clock: () => new Date(),
    sendMessage,
    isPhoneSuppressed,
    SuppressionLookupError,
    log: console,
  };
}

export function buildRecoveryBody(business: Business): string {
  const customTemplate = (business.settings as Record<string, unknown>)
    ?.smsTemplate as string | undefined;
  const template =
    customTemplate || SMS_TEMPLATES[business.vertical] || SMS_TEMPLATES.general;
  return appendOptOutFooter(template.replace('{business}', business.name));
}

export function fallbackDeferIso(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
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
  return persistDeferredRecoveryWithDeps(defaultSmsDeps(), opts);
}

export async function persistDeferredRecoveryWithDeps(
  deps: SmsDeps,
  opts: { leadId: string; body: string; nextSendAt: string }
): Promise<void> {
  const supabase = deps.db();
  const sid = recoveryMessageSid(opts.leadId);
  const { data: existing } = await supabase
    .from(TABLE.smsMessages)
    .select(SMS_SELECT_ID_STATUS)
    .eq(COL.messageSid, sid)
    .maybeSingle();

  if (existing) {
    await supabase
      .from(TABLE.smsMessages)
      .update({
        status: SMS_STATUS.deferred,
        next_retry_at: opts.nextSendAt,
        body: opts.body,
      })
      .eq(COL.messageSid, sid);
    return;
  }

  const { error } = await supabase.from(TABLE.smsMessages).insert({
    lead_id: opts.leadId,
    direction: DIRECTION_OUTBOUND,
    body: opts.body,
    message_sid: sid,
    status: SMS_STATUS.deferred,
    next_retry_at: opts.nextSendAt,
    key_supported_at_send: false,
  });
  if (error && error.code !== PG_UNIQUE) {
    deps.log.error('persist_deferred_insert_failed', error.message);
  }
  if (error?.code === PG_UNIQUE) {
    await supabase
      .from(TABLE.smsMessages)
      .update({
        status: SMS_STATUS.deferred,
        next_retry_at: opts.nextSendAt,
        body: opts.body,
      })
      .eq(COL.messageSid, sid);
  }
}

export async function sendRecoverySMS(
  leadId: string,
  business: Business,
  callerPhone: string
): Promise<void> {
  return sendRecoverySMSWithDeps(defaultSmsDeps(), leadId, business, callerPhone);
}

export async function sendRecoverySMSWithDeps(
  deps: SmsDeps,
  leadId: string,
  business: Business,
  callerPhone: string
): Promise<void> {
  const messageBody = buildRecoveryBody(business);
  const outcome = await deps.sendMessage({
    kind: KIND_RECOVERY,
    leadId,
    businessId: business.id,
    to: callerPhone,
    body: messageBody,
    idempotencyKey: recoveryMessageSid(leadId),
    businessTimezone: business.timezone,
    skipQuietHours: false,
  });

  const action = interpretRecoverySendOutcome(
    outcome,
    fallbackDeferIso(deps.clock())
  );

  switch (action.type) {
    case 'persist_deferred':
      await persistDeferredRecoveryWithDeps(deps, {
        leadId,
        body: messageBody,
        nextSendAt: action.nextSendAt,
      });
      deps.log.log(
        'recovery_deferred',
        redactPhone(callerPhone),
        action.nextSendAt
      );
      return;
    case 'log_blocked':
      deps.log.log(
        'recovery_blocked',
        redactPhone(callerPhone),
        action.reason
      );
      return;
    case 'log_needs_review':
      deps.log.error('recovery_needs_review', action.sid);
      return;
    case 'log_ambiguous':
      deps.log.warn(
        'recovery_ambiguous',
        redactPhone(callerPhone),
        action.reason
      );
      return;
    case 'log_sent':
      deps.log.log('recovery_sent', redactPhone(callerPhone), action.sid);
      return;
  }
}

/**
 * Cron: send recoveries whose quiet-hours deferral window has opened.
 */
export async function processDeferredRecoveries(): Promise<{
  sent: number;
  deferred: number;
  errors: number;
}> {
  return processDeferredRecoveriesWithDeps(defaultSmsDeps());
}

export async function processDeferredRecoveriesWithDeps(
  deps: SmsDeps
): Promise<{ sent: number; deferred: number; errors: number }> {
  const supabase = deps.db();
  const nowIso = deps.clock().toISOString();
  const { data: rows, error } = await supabase
    .from(TABLE.smsMessages)
    .select(SMS_SELECT_DEFERRED)
    .eq(COL.status, SMS_STATUS.deferred)
    .lte(COL.nextRetryAt, nowIso)
    .limit(50);

  if (error) {
    deps.log.error('deferred_query_failed', error.message);
    return { sent: 0, deferred: 0, errors: 1 };
  }

  let sent = 0;
  let deferred = 0;
  let errors = 0;

  for (const row of rows ?? []) {
    try {
      const { data: lead } = await supabase
        .from(TABLE.leads)
        .select(LEAD_SELECT_STAR_BIZ)
        .eq(COL.id, row.lead_id)
        .single();
      if (!lead?.businesses) {
        errors += 1;
        continue;
      }
      const business = lead.businesses as unknown as Business;
      const body = row.body || buildRecoveryBody(business);
      const outcome = await deps.sendMessage({
        kind: KIND_RECOVERY,
        leadId: lead.id,
        businessId: business.id,
        to: lead.caller_phone,
        body,
        idempotencyKey: recoveryMessageSid(lead.id),
        businessTimezone: business.timezone,
        skipQuietHours: false,
      });

      const rowAction = interpretDeferredRowOutcome(
        outcome,
        fallbackDeferIso(deps.clock())
      );
      switch (rowAction.type) {
        case 're_defer':
          await persistDeferredRecoveryWithDeps(deps, {
            leadId: lead.id,
            body,
            nextSendAt: rowAction.nextSendAt,
          });
          deferred += 1;
          break;
        case 'count_sent':
          sent += 1;
          break;
        case 'abandon':
          await supabase
            .from(TABLE.smsMessages)
            .update({ status: SMS_STATUS.abandonedDone, next_retry_at: null })
            .eq(COL.id, row.id);
          break;
        case 'count_parked':
          deferred += 1;
          break;
        case 'ignore':
          break;
      }
    } catch (err) {
      deps.log.error(
        'deferred_row_failed',
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
  return sendFollowUpSMSWithDeps(
    defaultSmsDeps(),
    leadId,
    business,
    callerPhone,
    customMessage
  );
}

export async function sendFollowUpSMSWithDeps(
  deps: SmsDeps,
  leadId: string,
  business: Business,
  callerPhone: string,
  customMessage?: string
): Promise<void> {
  // Restore suppression / opt-out checks (QC r6 P2)
  try {
    if (await deps.isPhoneSuppressed(business.id, callerPhone)) {
      deps.log.log('followup_suppressed', redactPhone(callerPhone));
      return;
    }
  } catch (err) {
    if (err instanceof deps.SuppressionLookupError) {
      deps.log.log('followup_suppression_lookup_failed', redactPhone(callerPhone));
      return;
    }
    throw err;
  }

  const supabase = deps.db();
  const { data: lead } = await supabase
    .from(TABLE.leads)
    .select(LEAD_SELECT_OPTED_OUT)
    .eq(COL.id, leadId)
    .maybeSingle();
  if (lead?.opted_out) {
    deps.log.log('followup_opted_out', redactPhone(callerPhone));
    return;
  }

  const defaultFollowUp = `Hi, this is ${business.name}. Just following up on your recent inquiry. How can we help?`;
  const messageBody = appendOptOutFooter(customMessage || defaultFollowUp);

  const outcome = await deps.sendMessage({
    kind: KIND_MANUAL,
    leadId,
    businessId: business.id,
    to: callerPhone,
    body: messageBody,
    businessTimezone: business.timezone,
    skipQuietHours: true,
  });

  if (outcome.kind === 'sent') {
    await supabase.from(TABLE.smsMessages).insert({
      lead_id: leadId,
      direction: DIRECTION_OUTBOUND,
      body: messageBody,
      message_sid: outcome.sid,
      status: outcome.providerStatus,
    });
  }
}
