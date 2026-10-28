/**
 * Pure send/reconcile state machine decisions (no I/O).
 *
 * Advance on duplicate sid ONLY if that row is confirmed sent.
 * Park enrollments with unknown sends until reconcile has checked them.
 * Requeue the exact step parsed from the sid.
 * Handle recovery sids separately from campaign steps.
 */

import {
  isConfirmedSmsStatus,
  parseMessageSid,
  type ParsedSid,
  type RelayLookupOutcome,
} from '@/services/sms-sid';

export type DuplicateSidDecision =
  | { action: 'advance' }
  | { action: 'park' };

export function decideOnDuplicateSid(
  existingStatus: string | null | undefined
): DuplicateSidDecision {
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
  | { action: 'park' };

export function decideReconcileRow(opts: {
  sid: string;
  outcome: RelayLookupOutcome;
  providerStatus?: string;
}): ReconcileRowDecision {
  const parsed = parseMessageSid(opts.sid);

  if (opts.outcome === 'sent') {
    return {
      action: 'confirm',
      providerStatus: opts.providerStatus || 'queued',
      parsed,
    };
  }

  if (opts.outcome === 'unknown') {
    return { action: 'park' };
  }

  // never_sent
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
