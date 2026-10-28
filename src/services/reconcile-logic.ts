/**
 * Pure send/reconcile state machine decisions (no I/O).
 *
 * Advance on duplicate sid ONLY if that row is confirmed sent (not failed).
 * Requeue ONLY on explicit never_sent AND key_supported_at_send.
 * Older/pre-key rows → needs_review, never requeue.
 */

import {
  isConfirmedSmsStatus,
  isFailedSmsStatus,
  parseMessageSid,
  type ParsedSid,
  type RelayLookupOutcome,
} from '@/services/sms-sid';

export type DuplicateSidDecision =
  | { action: 'advance' }
  | { action: 'park' }
  | { action: 'needs_review' };

export function decideOnDuplicateSid(
  existingStatus: string | null | undefined
): DuplicateSidDecision {
  if (isFailedSmsStatus(existingStatus)) return { action: 'needs_review' };
  if (isConfirmedSmsStatus(existingStatus)) return { action: 'advance' };
  return { action: 'park' };
}

export type ReconcileRowDecision =
  | {
      action: 'confirm';
      providerStatus: string;
      parsed: ParsedSid;
    }
  | {
      action: 'requeue_campaign';
      enrollmentId: string;
      campaignId: string;
      stepNumber: number;
    }
  | { action: 'requeue_recovery'; leadId: string }
  | { action: 'park' }
  | { action: 'needs_review'; reason?: string };

/** Max unknown reconcile attempts before needs_review. */
export const MAX_RECONCILE_ATTEMPTS = 5;

/**
 * Normalize a raw relay lookup (may lack `outcome`) into a safe outcome.
 * found:true + status=failed → failed.
 * found:true without outcome → sent (unless failed).
 * found:false without outcome → never_sent.
 * Missing outcome / silence → unknown (never invent never_sent).
 */
export function normalizeLookupOutcome(lookup: {
  outcome?: RelayLookupOutcome | string | null;
  found?: boolean;
  status?: string;
  id?: string;
}): { outcome: RelayLookupOutcome; providerStatus: string } {
  const status = lookup.status || 'queued';

  if (
    lookup.outcome === 'sent' ||
    lookup.outcome === 'never_sent' ||
    lookup.outcome === 'unknown' ||
    lookup.outcome === 'failed'
  ) {
    if (lookup.outcome === 'sent' && isFailedSmsStatus(status)) {
      return { outcome: 'failed', providerStatus: status };
    }
    return { outcome: lookup.outcome, providerStatus: status };
  }

  if (lookup.found === true) {
    if (isFailedSmsStatus(status)) {
      return { outcome: 'failed', providerStatus: status };
    }
    if (lookup.id || lookup.status) {
      return { outcome: 'sent', providerStatus: status };
    }
  }
  if (lookup.found === false) {
    return { outcome: 'never_sent', providerStatus: 'queued' };
  }
  return { outcome: 'unknown', providerStatus: status };
}

export function decideReconcileRow(opts: {
  sid: string;
  outcome: RelayLookupOutcome | string | null | undefined;
  providerStatus?: string;
  reconcileAttempts?: number;
  /** True only when this row was sent after key support was confirmed (or key echoed). */
  keySupportedAtSend?: boolean | null;
}): ReconcileRowDecision {
  const parsed = parseMessageSid(opts.sid);
  const attempts = opts.reconcileAttempts ?? 0;

  if (opts.outcome === 'failed') {
    return { action: 'needs_review', reason: 'relay_status_failed' };
  }

  if (opts.outcome === 'sent') {
    if (isFailedSmsStatus(opts.providerStatus)) {
      return { action: 'needs_review', reason: 'relay_status_failed' };
    }
    return {
      action: 'confirm',
      providerStatus: opts.providerStatus || 'queued',
      parsed,
    };
  }

  // ONLY explicit never_sent may requeue — and ONLY if the row was keyed
  // after lookup support was confirmed. Pre-upgrade / rollback rows → review.
  if (opts.outcome === 'never_sent') {
    if (!opts.keySupportedAtSend) {
      return {
        action: 'needs_review',
        reason: 'never_sent_without_key_support',
      };
    }
    if (parsed.kind === 'campaign') {
      return {
        action: 'requeue_campaign',
        enrollmentId: parsed.enrollmentId,
        campaignId: parsed.campaignId,
        stepNumber: parsed.stepNumber,
      };
    }
    if (parsed.kind === 'recovery') {
      return { action: 'requeue_recovery', leadId: parsed.leadId };
    }
    return { action: 'park' };
  }

  // unknown / missing / anything else → park (or needs_review after N attempts)
  if (attempts + 1 >= MAX_RECONCILE_ATTEMPTS) {
    return { action: 'needs_review', reason: 'max_attempts' };
  }
  return { action: 'park' };
}
