/**
 * Single outbound SMS module — thin I/O shell over pure decisions + machine.
 *
 * EVERY live send and every relay lookup goes through here.
 * Decisions live in ./decisions and ./machine; this file only does I/O.
 */

import { tryNormalizeToE164 } from '@/lib/phone';
import { redactPhone } from '@/lib/pii';
import {
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
  isCustomerSmsKind,
  mapRelaySendResult,
  resolveIdempotencySid,
  shouldResolveRecoveryGate,
} from './decisions';
import { defaultSendDeps, type SendDeps, type SupabaseClient } from './deps';
import {
  abandonedSid,
  coalesceLookupOutcome,
  coalesceReconcileAttempts,
  decideReconcileAlert,
  emptyReconcileCounts,
  noteReconcileOutcome,
  noteReconcileRowStatus,
  signalFromLookupOutcome,
} from './reconcile-tally';
import {
  clearLeadOutboundSidPayload,
  leadOutboundSidPayload,
  smsAbandonedRetryPayload,
  smsClaimDeferredPayload,
  smsConfirmSentPayload,
  smsNeedsReviewPayload,
  smsParkAmbiguousPayload,
  smsSendingInsertPayload,
  smsStatusOnlyPayload,
} from './send-io-plans';
import {
  COL,
  DIRECTION_OUTBOUND,
  KIND_CAMPAIGN,
  KIND_RECOVERY,
  LEAD_SELECT_GATES,
  LEAD_SELECT_OUTBOUND,
  LOOKUP_KIND,
  PG_UNIQUE,
  RECONCILE_PULL_STATUSES,
  reconcileOrFilter,
  RELAY_SIGNAL,
  SEND_REASON,
  SMS_SELECT_RECONCILE,
  SMS_SELECT_STATUS,
  SMS_STATUS,
  TABLE,
} from '@/services/db-strings';
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
      reason: SEND_REASON.invalidPhone,
      detail: `cannot normalize ${redactPhone(req.to)}`,
    };
  }

  const supabase = deps.db();

  if (isCustomerSmsKind(req.kind)) {
    // Stryker disable next-line BooleanLiteral: overwritten before read — EQUIVALENT.md send-suppressed-init-overwritten
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
      .from(TABLE.leads)
      .select(LEAD_SELECT_GATES)
      .eq(COL.id, req.leadId)
      .maybeSingle();

    let recovery:
      | ReturnType<typeof classifyRecoveryStatus>
      | undefined;
    if (shouldResolveRecoveryGate(req)) {
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

  if (isCustomerSmsKind(req.kind)) {
    const { error: insertError } = await supabase.from(TABLE.smsMessages).insert(
      smsSendingInsertPayload({
        leadId: req.leadId,
        body: req.body,
        sid,
        direction: DIRECTION_OUTBOUND,
        status: SMS_STATUS.sending,
      })
    );

    if (insertError?.code === PG_UNIQUE) {
      const { data: existing } = await supabase
        .from(TABLE.smsMessages)
        .select(SMS_SELECT_STATUS)
        .eq(COL.messageSid, sid)
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
          .from(TABLE.smsMessages)
          .update(
            smsClaimDeferredPayload({
              status: SMS_STATUS.sending,
              body: req.body,
            })
          )
          .eq(COL.messageSid, sid);
        return dispatchToRelay(deps, supabase, req, sid, toE164);
      }
      return {
        kind: 'blocked',
        reason: SEND_REASON.duplicateInFlight,
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
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error(
      `sendMessage relay error sid=${sid}:`,
      err instanceof Error ? err.message : 'unknown'
    );
    // Stryker restore StringLiteral,CallExpression
    signal = { type: RELAY_SIGNAL.error as 'error' };
  }

  const decision = transitionSend({
    kind: 'send_result',
    signal,
    capsBeforeSend,
  });

  if (decision.action === 'confirm_sent') {
    if (isCustomerSmsKind(req.kind)) {
      await supabase
        .from(TABLE.smsMessages)
        .update(
          smsConfirmSentPayload({
            providerStatus: decision.providerStatus,
            keySupportedAtSend: decision.keySupportedAtSend,
          })
        )
        .eq(COL.messageSid, sid);
      if (req.kind === KIND_RECOVERY) {
        await supabase
          .from(TABLE.leads)
          .update(leadOutboundSidPayload(sid))
          .eq(COL.id, req.leadId);
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
    if (isCustomerSmsKind(req.kind)) {
      await supabase
        .from(TABLE.smsMessages)
        .update(smsStatusOnlyPayload(SMS_STATUS.needsReview))
        .eq(COL.messageSid, sid);
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
  if (isCustomerSmsKind(req.kind)) {
    await supabase
      .from(TABLE.smsMessages)
      .update(
        smsParkAmbiguousPayload({
          status: SMS_STATUS.unknown,
          nextAttempts: decision.nextAttempts,
          nextRetryAt,
        })
      )
      .eq(COL.messageSid, sid);
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
  // Stryker disable next-line BlockStatement: thin default wrapper — EQUIVALENT.md send-resolveRecovery-default-wrapper
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
    .from(TABLE.smsMessages)
    .select(SMS_SELECT_STATUS)
    .eq(COL.messageSid, sid)
    .maybeSingle();
  if (data?.status) return classifyRecoveryStatus(data.status);

  const { data: lead } = await supabase
    .from(TABLE.leads)
    .select(LEAD_SELECT_OUTBOUND)
    .eq(COL.id, leadId)
    .maybeSingle();
  if (!lead?.sms_outbound_sid) return 'absent';
  const { data: byLead } = await supabase
    .from(TABLE.smsMessages)
    .select(SMS_SELECT_STATUS)
    .eq(COL.messageSid, lead.sms_outbound_sid)
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
      reason: SEND_REASON.lookupUnsupported,
    };
  }

  const supabase = deps.db();
  let signal: RelayLookupSignal;
  try {
    const lookup = await adapter.lookupByIdempotencyKey(row.message_sid);
    signal = signalFromLookupOutcome(
      coalesceLookupOutcome(lookup),
      lookup
    );
  } catch {
    signal = { type: RELAY_SIGNAL.unknown as 'unknown' };
  }

  const attempts = coalesceReconcileAttempts(row.reconcile_attempts);
  const decision = transitionSend({
    kind: LOOKUP_KIND as 'lookup',
    signal,
    keySupportedAtSend: Boolean(row.key_supported_at_send),
    attempts,
  });

  if (decision.action === 'resolved') {
    await supabase
      .from(TABLE.smsMessages)
      .update(smsStatusOnlyPayload(decision.providerStatus))
      .eq(COL.id, row.id);
    return {
      kind: 'resolved',
      sid: row.message_sid,
      providerStatus: decision.providerStatus,
    };
  }

  if (decision.action === 'requeue_never_sent') {
    const abandoned = abandonedSid(row.message_sid, deps.clock().getTime());
    await supabase
      .from(TABLE.smsMessages)
      .update(
        smsAbandonedRetryPayload({
          status: SMS_STATUS.abandonedRetry,
          abandonedSid: abandoned,
        })
      )
      .eq(COL.id, row.id);
    return { kind: 'never_sent', sid: row.message_sid, requeued: true };
  }

  if (decision.action === 'needs_review') {
    await supabase
      .from(TABLE.smsMessages)
      .update(smsNeedsReviewPayload({ status: SMS_STATUS.needsReview }))
      .eq(COL.id, row.id);
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
    .from(TABLE.smsMessages)
    .update(
      smsParkAmbiguousPayload({
        status: SMS_STATUS.unknown,
        nextAttempts,
        nextRetryAt,
      })
    )
    .eq(COL.id, row.id);
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
  // Stryker disable next-line BlockStatement: thin default wrapper — same as resolveRecoveryOutcome
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
    .from(TABLE.smsMessages)
    .select(SMS_SELECT_RECONCILE)
    .in(COL.status, [...RECONCILE_PULL_STATUSES])
    .or(reconcileOrFilter(nowIso, cutoff))
    .order(COL.sentAt, { ascending: true })
    .limit(50);

  let counts = emptyReconcileCounts();

  for (const row of rows ?? []) {
    counts = noteReconcileRowStatus(counts, row.status);
    const result = await reconcileOneWithDeps(deps, row);
    counts = noteReconcileOutcome(counts, result.kind);
    if (result.kind === 'never_sent') {
      await onReconcileNeverSent(supabase, row.message_sid, row.lead_id);
    }
  }

  return {
    ...counts,
    alert: decideReconcileAlert(counts, UNKNOWN_SMS_ALERT_THRESHOLD),
  };
}

async function onReconcileNeverSent(
  supabase: SupabaseClient,
  sid: string,
  leadId: string
) {
  const parsed = parseMessageSid(sid);
  if (parsed.kind === KIND_RECOVERY) {
    await supabase
      .from(TABLE.leads)
      .update(clearLeadOutboundSidPayload())
      .eq(COL.id, leadId);
  }
}

/** Test helper re-exports */
export { markRelayKeySupportConfirmed, resetRelayKeySupportConfirmed };
