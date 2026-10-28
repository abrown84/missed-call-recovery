/**
 * Pure reconcile counters / alert / lookup-signal mapping.
 * Keeps Arithmetic/Conditional/Equality mutants out of send/index I/O.
 */

import { classifyRelayLookupResponse } from '@/services/sms-sid';
import type { RelayLookupSignal } from './machine';
import { RELAY_SIGNAL, SMS_STATUS } from '@/services/db-strings';

export type ReconcileCounts = {
  unknownCount: number;
  stuckSendingCount: number;
  requeued: number;
  confirmed: number;
  parked: number;
  needsReview: number;
};

export function emptyReconcileCounts(): ReconcileCounts {
  return {
    unknownCount: 0,
    stuckSendingCount: 0,
    requeued: 0,
    confirmed: 0,
    parked: 0,
    needsReview: 0,
  };
}

/** Bump status tallies before reconcileOne runs. */
export function noteReconcileRowStatus(
  counts: ReconcileCounts,
  status: string
): ReconcileCounts {
  const next = { ...counts };
  if (status === SMS_STATUS.unknown) next.unknownCount += 1;
  if (status === SMS_STATUS.sending) next.stuckSendingCount += 1;
  return next;
}

/** Bump outcome tallies after reconcileOne. */
export function noteReconcileOutcome(
  counts: ReconcileCounts,
  kind: string
): ReconcileCounts {
  const next = { ...counts };
  if (kind === 'resolved') next.confirmed += 1;
  else if (kind === 'never_sent') next.requeued += 1;
  else if (kind === 'needs_review') next.needsReview += 1;
  else if (kind === 'ambiguous') next.parked += 1;
  return next;
}

export function decideReconcileAlert(
  counts: ReconcileCounts,
  threshold: number
): boolean {
  return (
    counts.unknownCount + counts.stuckSendingCount >= threshold ||
    counts.needsReview > 0
  );
}

export function lookupStatusOr(
  lookup: { status?: unknown },
  fallback: string
): string {
  return 'status' in lookup ? String(lookup.status) : fallback;
}

export function signalFromLookupOutcome(
  outcome: string,
  lookup: { status?: unknown }
): RelayLookupSignal {
  if (outcome === 'sent') {
    return {
      type: 'sent',
      status: lookupStatusOr(lookup, SMS_STATUS.queued),
    };
  }
  if (outcome === 'failed') {
    return {
      type: 'failed',
      status: lookupStatusOr(lookup, 'failed'),
    };
  }
  if (outcome === 'never_sent') {
    return { type: 'never_sent' };
  }
  return { type: RELAY_SIGNAL.unknown as 'unknown' };
}

export function abandonedSid(originalSid: string, nowMs: number): string {
  return `${originalSid}:abandoned:${nowMs}`;
}

/** Nullish coalesce for reconcile_attempts — keeps ?? mutants out of I/O. */
export function coalesceReconcileAttempts(
  attempts: number | null | undefined
): number {
  return attempts ?? 0;
}

/**
 * Prefer explicit relay outcome; otherwise classify the raw lookup body.
 * Pure so LogicalOperator survivors leave send/index.
 */
export function coalesceLookupOutcome(lookup: {
  outcome?: string;
  status?: unknown;
  found?: boolean;
}): string {
  if (lookup.outcome) return lookup.outcome;
  return classifyRelayLookupResponse({
    httpStatus: 200,
    body: lookup,
  });
}
