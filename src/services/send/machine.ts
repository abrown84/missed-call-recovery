/**
 * Pure send/reconcile state machine.
 *
 * Lifecycle:
 *   queued → sent | never_sent | ambiguous → (reconcile) → resolved | needs_review
 *
 * Transitions are total and deterministic — property-tested with fast-check.
 */

export const MAX_RECONCILE_ATTEMPTS = 5;

/** Base park interval (5 min); doubles each attempt, capped at 6h. */
export const PARK_BASE_MS = 5 * 60 * 1000;
export const PARK_MAX_MS = 6 * 60 * 60 * 1000;

export type RelaySendSignal =
  | { type: 'ok'; messageId: string; status: string; keyEchoed: boolean; duplicate?: boolean }
  | { type: 'conflict' }
  | { type: 'rate_limit' }
  | { type: 'maintenance' }
  | { type: 'failed'; status?: string }
  | { type: 'error' };

export type RelayLookupSignal =
  | { type: 'sent'; status: string }
  | { type: 'never_sent' }
  | { type: 'failed'; status: string }
  | { type: 'unknown' };

export type SendRowPhase =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'never_sent'
  | 'ambiguous'
  | 'needs_review'
  | 'resolved';

export type SendMachineEvent =
  | { kind: 'send_result'; signal: RelaySendSignal; capsBeforeSend: boolean }
  | { kind: 'lookup'; signal: RelayLookupSignal; keySupportedAtSend: boolean; attempts: number };

export type SendMachineDecision =
  | {
      action: 'confirm_sent';
      providerStatus: string;
      keySupportedAtSend: boolean;
      phase: 'sent';
    }
  | { action: 'park_ambiguous'; reason: string; phase: 'ambiguous'; nextAttempts: number }
  | { action: 'needs_review'; reason: string; phase: 'needs_review' }
  | { action: 'requeue_never_sent'; phase: 'never_sent' }
  | { action: 'resolved'; providerStatus: string; phase: 'resolved' };

export function parkDelayMs(reconcileAttempts: number): number {
  const n = Number(reconcileAttempts);
  const exp = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const raw = PARK_BASE_MS * 2 ** exp;
  return Math.min(raw, PARK_MAX_MS);
}

export function parkNextAt(
  reconcileAttempts: number,
  now: Date = new Date()
): Date {
  return new Date(now.getTime() + parkDelayMs(reconcileAttempts));
}

const FAILED_STATUSES = new Set([
  'failed',
  'undelivered',
  'rejected',
  'error',
]);

const CONFIRMED_STATUSES = new Set([
  'queued',
  'dispatched',
  'sent',
  'delivered',
]);

/**
 * Apply a send or lookup event to the row state machine.
 * Does not perform I/O — callers persist the decision.
 */
export function transitionSend(event: SendMachineEvent): SendMachineDecision {
  if (event.kind === 'send_result') {
    return onSendResult(event.signal, event.capsBeforeSend);
  }
  return onLookup(
    event.signal,
    event.keySupportedAtSend,
    event.attempts
  );
}

function onSendResult(
  signal: RelaySendSignal,
  capsBeforeSend: boolean
): SendMachineDecision {
  switch (signal.type) {
    case 'ok': {
      if (signal.duplicate && isFailedStatus(signal.status)) {
        return { action: 'needs_review', reason: 'duplicate_failed', phase: 'needs_review' };
      }
      if (isFailedStatus(signal.status)) {
        return { action: 'needs_review', reason: 'relay_failed', phase: 'needs_review' };
      }
      return {
        action: 'confirm_sent',
        providerStatus: signal.status || 'queued',
        keySupportedAtSend: capsBeforeSend && signal.keyEchoed,
        phase: 'sent',
      };
    }
    case 'conflict':
      return { action: 'needs_review', reason: 'idempotency_conflict', phase: 'needs_review' };
    case 'failed':
      return { action: 'needs_review', reason: 'relay_failed', phase: 'needs_review' };
    case 'rate_limit':
      return {
        action: 'park_ambiguous',
        reason: 'recent_send',
        phase: 'ambiguous',
        nextAttempts: 0,
      };
    case 'maintenance':
      return {
        action: 'park_ambiguous',
        reason: 'maintenance',
        phase: 'ambiguous',
        nextAttempts: 0,
      };
    case 'error':
    default:
      return {
        action: 'park_ambiguous',
        reason: 'send_error',
        phase: 'ambiguous',
        nextAttempts: 0,
      };
  }
}

function onLookup(
  signal: RelayLookupSignal,
  keySupportedAtSend: boolean,
  attempts: number
): SendMachineDecision {
  switch (signal.type) {
    case 'sent':
      if (isFailedStatus(signal.status)) {
        return { action: 'needs_review', reason: 'relay_status_failed', phase: 'needs_review' };
      }
      // Non-terminal / odd statuses on found:true → park (never invent resolved)
      if (!isConfirmedStatus(signal.status)) {
        const next = attempts + 1;
        if (next >= MAX_RECONCILE_ATTEMPTS) {
          return { action: 'needs_review', reason: 'max_attempts', phase: 'needs_review' };
        }
        return {
          action: 'park_ambiguous',
          reason: 'lookup_nonterminal',
          phase: 'ambiguous',
          nextAttempts: next,
        };
      }
      return {
        action: 'resolved',
        providerStatus: signal.status || 'queued',
        phase: 'resolved',
      };
    case 'failed':
      return { action: 'needs_review', reason: 'relay_status_failed', phase: 'needs_review' };
    case 'never_sent':
      if (!keySupportedAtSend) {
        return {
          action: 'needs_review',
          reason: 'never_sent_without_key_support',
          phase: 'needs_review',
        };
      }
      return { action: 'requeue_never_sent', phase: 'never_sent' };
    case 'unknown':
    default: {
      const next = Math.max(0, attempts) + 1;
      if (next >= MAX_RECONCILE_ATTEMPTS) {
        return { action: 'needs_review', reason: 'max_attempts', phase: 'needs_review' };
      }
      return {
        action: 'park_ambiguous',
        reason: 'lookup_unknown',
        phase: 'ambiguous',
        nextAttempts: next,
      };
    }
  }
}

export function isFailedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return FAILED_STATUSES.has(String(status).toLowerCase());
}

export function isConfirmedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return CONFIRMED_STATUSES.has(String(status).toLowerCase());
}

export function isAmbiguousStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return s === 'sending' || s === 'unknown' || s === 'deferred' || s === 'pending';
}

/** Recovery resolution used to gate campaign step 1. */
export type RecoveryResolvedOutcome =
  | 'resolved_sent'
  | 'resolved_abandoned'
  | 'pending'
  | 'absent';

export function classifyRecoveryStatus(
  status: string | null | undefined
): RecoveryResolvedOutcome {
  if (!status) return 'absent';
  const s = String(status).toLowerCase();
  if (isConfirmedStatus(s)) return 'resolved_sent';
  if (s === 'abandoned_retry' || s === 'abandoned_done') return 'resolved_abandoned';
  if (s === 'deferred') return 'pending';
  if (
    isAmbiguousStatus(s) ||
    s === 'needs_review' ||
    isFailedStatus(s)
  ) {
    return 'pending';
  }
  // Unknown vocabulary → pending (never treat as absent → no step-1 double send)
  return 'pending';
}
