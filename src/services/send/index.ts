/**
 * Single outbound SMS module — thin I/O shell over pure decisions + machine.
 *
 * EVERY live send and every relay lookup goes through here.
 * Decisions live in ./decisions and ./machine; this file only does I/O.
 */

import { tryNormalizeToE164 } from '@/lib/phone';
import { redactPhone } from '@/lib/pii';
import {
  classifyRelayLookupResponse,
  parseMessageSid,
  markRelayKeySupportConfirmed,
  resetRelayKeySupportConfirmed,
  recoveryMessageSid,
} from '@/services/sms-sid';
import {
  classifyRecoveryStatus,
  parkNextAt,
  transitionSend,
  MAX_RECONCILE_ATTEMPTS,
  type RelayLookupSignal,
  type RelaySendSignal,
} from './machine';
import { isSendsEnabled } from './policy';
import {
  decideCustomerFacingGates,
  decideDuplicateSid,
  mapRelaySendResult,
  resolveIdempotencySid,
} from './decisions';
import { defaultSendDeps, type SendDeps, type SupabaseClient } from './deps';
import type {
  ReconcileOutcome,
  SendOutcome,
  SendRequest,
} from './types';

export {
  MAX_RECONCILE_ATTEMPTS,
  parkDelayMs,
  parkNextAt,
  transitionSend,
  classifyRecoveryStatus,
  isConfirmedStatus,
  isFailedStatus,
  isAmbiguousStatus,
} from './machine';
export { isSendsEnabled } from './policy';
export type {
  SendOutcome,
  SendRequest,
  ReconcileOutcome,
  SendKind,
  RecoveryResolvedOutcome,
} from './types';
export type { SendDeps } from './deps';
export { defaultSendDeps } from './deps';

/** Test-only: dry-run must not set production key-support trust. */
export function noteDryRunIsTestOnly(): void {
  // Documented for CAMPAIGNS.md / PR disclosure. No runtime effect.
}

export async function sendMessage(req: SendRequest): Promise<SendOutcome> {
  return sendMessageWithDeps(defaultSendDeps(), req);
}

/**
 * THE single send entry point (DI). Normalizes to E.164, gates on SENDS_ENABLED,
 * quiet hours, suppression, and (for campaign step 1) recovery resolution.
 */
export async function sendMessageWithDeps(
  deps: SendDeps,
  req: SendRequest
): Promise<SendOutcome> {
  if (!deps.sendsEnabled()) {
    return { kind: 'blocked', reason: 'sends_disabled' };
  }

  const toE164 = tryNormalizeToE164(req.to);
  if (!toE164) {
    return {
      kind: 'blocked',
      reason: 'invalid_phone',
      detail: `cannot normalize ${redactPhone(req.to)}`,
    };
  }

  const supabase = deps.db();

  if (req.kind === 'recovery' || req.kind === 'campaign') {
    let suppressed = false;
    try {
      suppressed = await deps.isPhoneSuppressed(req.businessId, toE164);
    } catch (err) {
      if (err instanceof deps.SuppressionLookupError) {
        return {
          kind: 'blocked',
          reason: 'suppressed',
          detail: 'lookup_failed_closed',
        };
      }
      throw err;
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('opted_out, timezone, sms_outbound_sid')
      .eq('id', req.leadId)
      .maybeSingle();

    let recovery:
      | ReturnType<typeof classifyRecoveryStatus>
      | undefined;
    if (
      req.kind === 'campaign' &&
      req.stepNumber === 1 &&
      !req.skipRecoveryGate
    ) {
      recovery = await resolveRecoveryOutcomeWithDeps(
        deps,
        supabase,
        req.leadId
      );
    }

    let quiet = undefined;
    if (!req.skipQuietHours) {
      const leadTz =
        req.leadTimezone ??
        (lead as { timezone?: string | null } | null)?.timezone ??
        null;
      quiet = deps.quietHours(deps.clock(), {
        callerPhoneE164: toE164,
        leadTimezone: leadTz,
        businessTimezone: req.businessTimezone,
      });
    }

    const gate = decideCustomerFacingGates({
      kind: req.kind,
      stepNumber: req.stepNumber,
      skipRecoveryGate: req.skipRecoveryGate,
      skipQuietHours: req.skipQuietHours,
      suppressed,
      optedOut: Boolean(lead?.opted_out),
      recovery,
      quiet,
    });
    if (gate) return gate;
  }

  const sid = resolveIdempotencySid(req, deps.clock().getTime());

  if (req.kind === 'recovery' || req.kind === 'campaign') {
    const { error: insertError } = await supabase.from('sms_messages').insert({
      lead_id: req.leadId,
      direction: 'outbound',
      body: req.body,
      message_sid: sid,
      status: 'sending',
      key_supported_at_send: false,
    });

    if (insertError?.code === '23505') {
      const { data: existing } = await supabase
        .from('sms_messages')
        .select('status')
        .eq('message_sid', sid)
        .maybeSingle();
      const dup = decideDuplicateSid(existing?.status);
      if (dup.action === 'confirm_existing') {
        return {
          kind: 'sent',
          sid,
          messageId: sid,
          providerStatus: dup.status,
          keySupportedAtSend: false,
        };
      }
      if (dup.action === 'needs_review') {
        return { kind: 'needs_review', sid, reason: dup.reason };
      }
      if (dup.action === 'claim_deferred') {
        await supabase
          .from('sms_messages')
          .update({
            status: 'sending',
            next_retry_at: null,
            body: req.body,
          })
          .eq('message_sid', sid);
        return dispatchToRelay(deps, supabase, req, sid, toE164);
      }
      return {
        kind: 'blocked',
        reason: 'duplicate_in_flight',
        detail: dup.detail,
      };
    }
    if (insertError) {
      throw new Error(`sms_messages insert failed: ${insertError.message}`);
    }
  }

  return dispatchToRelay(deps, supabase, req, sid, toE164);
}

async function dispatchToRelay(
  deps: SendDeps,
  supabase: SupabaseClient,
  req: SendRequest,
  sid: string,
  toE164: string
): Promise<SendOutcome> {
  const adapter = deps.adapter();

  let capsBeforeSend = deps.capsConfirmed();
  if (!capsBeforeSend && adapter.checkLookupSupport) {
    capsBeforeSend = await deps.ensureCaps(adapter);
  }

  let signal: RelaySendSignal;
  try {
    const result = await adapter.sendMessage({
      to: toE164,
      body: req.body,
      auto: req.auto ?? true,
      idempotencyKey: sid,
    });
    signal = mapRelaySendResult(result);
  } catch (err) {
    // Stryker disable next-line StringLiteral: log-only message (no control flow)
    console.error(
      `sendMessage relay error sid=${sid}:`,
      err instanceof Error ? err.message : 'unknown'
    );
    signal = { type: 'error' };
  }

  const decision = transitionSend({
    kind: 'send_result',
    signal,
    capsBeforeSend,
  });

  if (decision.action === 'confirm_sent') {
    if (req.kind === 'recovery' || req.kind === 'campaign') {
      await supabase
        .from('sms_messages')
        .update({
          status: decision.providerStatus,
          key_supported_at_send: decision.keySupportedAtSend,
        })
        .eq('message_sid', sid);
      if (req.kind === 'recovery') {
        await supabase
          .from('leads')
          .update({ sms_outbound_sid: sid })
          .eq('id', req.leadId);
      }
    }
    return {
      kind: 'sent',
      sid,
      messageId: signal.type === 'ok' ? signal.messageId : sid,
      providerStatus: decision.providerStatus,
      keySupportedAtSend: decision.keySupportedAtSend,
    };
  }

  if (decision.action === 'needs_review') {
    if (req.kind === 'recovery' || req.kind === 'campaign') {
      await supabase
        .from('sms_messages')
        .update({ status: 'needs_review' })
        .eq('message_sid', sid);
    }
    return { kind: 'needs_review', sid, reason: decision.reason };
  }

  if (decision.action !== 'park_ambiguous') {
    return { kind: 'needs_review', sid, reason: 'unexpected_decision' };
  }
  const nextRetryAt = parkNextAt(
    decision.nextAttempts,
    deps.clock()
  ).toISOString();
  if (req.kind === 'recovery' || req.kind === 'campaign') {
    await supabase
      .from('sms_messages')
      .update({
        status: 'unknown',
        reconcile_attempts: decision.nextAttempts,
        next_retry_at: nextRetryAt,
      })
      .eq('message_sid', sid);
  }
  return {
    kind: 'ambiguous',
    sid,
    reason: decision.reason,
    nextRetryAt,
  };
}

export async function resolveRecoveryOutcome(
  supabase: SupabaseClient,
  leadId: string
): Promise<ReturnType<typeof classifyRecoveryStatus>> {
  return resolveRecoveryOutcomeWithDeps(defaultSendDeps(), supabase, leadId);
}

export async function resolveRecoveryOutcomeWithDeps(
  deps: SendDeps,
  supabase: SupabaseClient,
  leadId: string
): Promise<ReturnType<typeof classifyRecoveryStatus>> {
  void deps;
  const sid = recoveryMessageSid(leadId);
  const { data } = await supabase
    .from('sms_messages')
    .select('status')
    .eq('message_sid', sid)
    .maybeSingle();
  if (data?.status) return classifyRecoveryStatus(data.status);

  const { data: lead } = await supabase
    .from('leads')
    .select('sms_outbound_sid')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead?.sms_outbound_sid) return 'absent';
  const { data: byLead } = await supabase
    .from('sms_messages')
    .select('status')
    .eq('message_sid', lead.sms_outbound_sid)
    .maybeSingle();
  return classifyRecoveryStatus(byLead?.status);
}

export async function reconcileOne(
  row: {
    id: string;
    lead_id: string;
    message_sid: string;
    status: string;
    reconcile_attempts?: number | null;
    key_supported_at_send?: boolean | null;
    next_retry_at?: string | null;
  }
): Promise<ReconcileOutcome> {
  return reconcileOneWithDeps(defaultSendDeps(), row);
}

export async function reconcileOneWithDeps(
  deps: SendDeps,
  row: {
    id: string;
    lead_id: string;
    message_sid: string;
    status: string;
    reconcile_attempts?: number | null;
    key_supported_at_send?: boolean | null;
    next_retry_at?: string | null;
  }
): Promise<ReconcileOutcome> {
  if (!deps.sendsEnabled()) {
    return { kind: 'blocked', reason: 'sends_disabled' };
  }

  const adapter = deps.adapter();
  if (!adapter.lookupByIdempotencyKey) {
    return {
      kind: 'needs_review',
      sid: row.message_sid,
      reason: 'lookup_unsupported',
    };
  }

  const supabase = deps.db();
  let signal: RelayLookupSignal;
  try {
    const lookup = await adapter.lookupByIdempotencyKey(row.message_sid);
    const outcome =
      lookup.outcome ??
      classifyRelayLookupResponse({
        httpStatus: 200,
        body: lookup,
      });
    if (outcome === 'sent') {
      signal = {
        type: 'sent',
        status: 'status' in lookup ? lookup.status : 'queued',
      };
    } else if (outcome === 'failed') {
      signal = {
        type: 'failed',
        status: 'status' in lookup ? String(lookup.status) : 'failed',
      };
    } else if (outcome === 'never_sent') {
      signal = { type: 'never_sent' };
    } else {
      signal = { type: 'unknown' };
    }
  } catch {
    signal = { type: 'unknown' };
  }

  const attempts = row.reconcile_attempts ?? 0;
  const decision = transitionSend({
    kind: 'lookup',
    signal,
    keySupportedAtSend: Boolean(row.key_supported_at_send),
    attempts,
  });

  if (decision.action === 'resolved') {
    await supabase
      .from('sms_messages')
      .update({ status: decision.providerStatus })
      .eq('id', row.id);
    return {
      kind: 'resolved',
      sid: row.message_sid,
      providerStatus: decision.providerStatus,
    };
  }

  if (decision.action === 'requeue_never_sent') {
    const abandoned = `${row.message_sid}:abandoned:${deps.clock().getTime()}`;
    await supabase
      .from('sms_messages')
      .update({ status: 'abandoned_retry', message_sid: abandoned })
      .eq('id', row.id);
    return { kind: 'never_sent', sid: row.message_sid, requeued: true };
  }

  if (decision.action === 'needs_review') {
    await supabase
      .from('sms_messages')
      .update({ status: 'needs_review', next_retry_at: null })
      .eq('id', row.id);
    return {
      kind: 'needs_review',
      sid: row.message_sid,
      reason: decision.reason,
    };
  }

  if (decision.action !== 'park_ambiguous') {
    return {
      kind: 'needs_review',
      sid: row.message_sid,
      reason: 'unexpected_decision',
    };
  }
  const nextAttempts = decision.nextAttempts;
  const nextRetryAt = parkNextAt(nextAttempts, deps.clock()).toISOString();
  await supabase
    .from('sms_messages')
    .update({
      status: 'unknown',
      reconcile_attempts: nextAttempts,
      next_retry_at: nextRetryAt,
    })
    .eq('id', row.id);
  return {
    kind: 'ambiguous',
    sid: row.message_sid,
    attempts: nextAttempts,
    nextRetryAt,
  };
}

export async function reconcileAmbiguousSms(): Promise<{
  unknownCount: number;
  stuckSendingCount: number;
  requeued: number;
  confirmed: number;
  parked: number;
  needsReview: number;
  alert: boolean;
}> {
  return reconcileAmbiguousSmsWithDeps(defaultSendDeps());
}

export async function reconcileAmbiguousSmsWithDeps(deps: SendDeps): Promise<{
  unknownCount: number;
  stuckSendingCount: number;
  requeued: number;
  confirmed: number;
  parked: number;
  needsReview: number;
  alert: boolean;
}> {
  const { UNKNOWN_SMS_ALERT_THRESHOLD, STUCK_SENDING_MS } = await import(
    '@/services/campaign-logic'
  );
  const supabase = deps.db();
  const adapter = deps.adapter();
  if (adapter.checkLookupSupport) {
    await deps.warnLookupUnsupported(adapter);
  }

  const now = deps.clock();
  const cutoff = new Date(now.getTime() - STUCK_SENDING_MS).toISOString();
  const nowIso = now.toISOString();
  const { data: rows } = await supabase
    .from('sms_messages')
    .select(
      'id, lead_id, message_sid, status, sent_at, reconcile_attempts, key_supported_at_send, next_retry_at'
    )
    .in('status', ['unknown', 'sending'])
    .or(
      `and(status.eq.unknown,next_retry_at.is.null),` +
        `and(status.eq.unknown,next_retry_at.lte.${nowIso}),` +
        `and(status.eq.sending,sent_at.lt.${cutoff})`
    )
    .order('sent_at', { ascending: true })
    .limit(50);

  let requeued = 0;
  let confirmed = 0;
  let parked = 0;
  let needsReview = 0;
  let unknownCount = 0;
  let stuckSendingCount = 0;

  for (const row of rows ?? []) {
    if (row.status === 'unknown') unknownCount += 1;
    if (row.status === 'sending') stuckSendingCount += 1;

    const result = await reconcileOneWithDeps(deps, row);
    if (result.kind === 'resolved') {
      confirmed += 1;
      await onReconcileResolved(supabase, row.message_sid);
    } else if (result.kind === 'never_sent') {
      requeued += 1;
      await onReconcileNeverSent(supabase, row.message_sid, row.lead_id);
    } else if (result.kind === 'needs_review') {
      needsReview += 1;
    } else if (result.kind === 'ambiguous') {
      parked += 1;
    }
  }

  const alert =
    unknownCount + stuckSendingCount >= UNKNOWN_SMS_ALERT_THRESHOLD ||
    needsReview > 0;
  return {
    unknownCount,
    stuckSendingCount,
    requeued,
    confirmed,
    parked,
    needsReview,
    alert,
  };
}

async function onReconcileResolved(supabase: SupabaseClient, sid: string) {
  const parsed = parseMessageSid(sid);
  if (parsed.kind !== 'campaign') return;
  void supabase;
  void parsed;
}

async function onReconcileNeverSent(
  supabase: SupabaseClient,
  sid: string,
  leadId: string
) {
  const parsed = parseMessageSid(sid);
  if (parsed.kind === 'recovery') {
    await supabase
      .from('leads')
      .update({ sms_outbound_sid: null })
      .eq('id', leadId);
  }
}

/** Test helper re-exports */
export { markRelayKeySupportConfirmed, resetRelayKeySupportConfirmed };
