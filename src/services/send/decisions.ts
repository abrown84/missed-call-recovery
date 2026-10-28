/**
 * Pure send-path decisions — no DB, no relay, no clock.
 * Exhaustively property/example tested; I/O shell only executes the results.
 */

import {
  campaignStepMessageSid,
  recoveryMessageSid,
} from '@/services/sms-sid';
import {
  classifyRecoveryStatus,
  isConfirmedStatus,
  isFailedStatus,
  type RelaySendSignal,
  type RecoveryResolvedOutcome,
} from './machine';
import type { SendKind, SendOutcome, SendRequest } from './types';

export type QuietHoursInput =
  | { allowed: true; zones: string[]; endHour?: number }
  | {
      allowed: false;
      unresolved?: false;
      nextSendAt: Date;
      zones: string[];
      endHour?: number;
    }
  | { allowed: false; unresolved: true; reason: string; zones: string[] };

/** Customer-facing kinds that persist sms_messages rows. */
export function isCustomerSmsKind(
  kind: SendKind
): kind is 'recovery' | 'campaign' {
  return kind === 'recovery' || kind === 'campaign';
}

/** Whether the I/O shell must resolve recovery before campaign step 1. */
export function shouldResolveRecoveryGate(input: {
  kind: SendKind;
  stepNumber?: number;
  skipRecoveryGate?: boolean;
}): boolean {
  return (
    input.kind === 'campaign' &&
    input.stepNumber === 1 &&
    !input.skipRecoveryGate
  );
}

/** Pre-send gate after E.164 is known (suppression/opt-out/recovery/quiet). */
export function decideCustomerFacingGates(input: {
  kind: SendKind;
  stepNumber?: number;
  skipRecoveryGate?: boolean;
  skipQuietHours?: boolean;
  suppressed: boolean;
  optedOut: boolean;
  recovery?: RecoveryResolvedOutcome;
  quiet?: QuietHoursInput;
}): SendOutcome | null {
  if (!isCustomerSmsKind(input.kind)) return null;

  if (input.suppressed) {
    return { kind: 'blocked', reason: 'suppressed' };
  }
  if (input.optedOut) {
    return { kind: 'blocked', reason: 'opted_out' };
  }

  if (shouldResolveRecoveryGate(input)) {
    if (input.recovery === 'pending') {
      return { kind: 'blocked', reason: 'recovery_pending' };
    }
    if (input.recovery === 'resolved_sent') {
      return {
        kind: 'skipped',
        reason: 'recovery_already_sent_skip_step_1',
      };
    }
  }

  if (!input.skipQuietHours && input.quiet && !input.quiet.allowed) {
    if ('unresolved' in input.quiet && input.quiet.unresolved) {
      return {
        kind: 'blocked',
        reason: 'quiet_hours_unresolved',
        detail: input.quiet.reason,
      };
    }
    if ('nextSendAt' in input.quiet && input.quiet.nextSendAt) {
      return {
        kind: 'blocked',
        reason: 'quiet_hours_deferred',
        nextSendAt: input.quiet.nextSendAt.toISOString(),
      };
    }
  }

  return null;
}

export function resolveIdempotencySid(
  req: Pick<
    SendRequest,
    | 'idempotencyKey'
    | 'kind'
    | 'leadId'
    | 'enrollmentId'
    | 'campaignId'
    | 'stepNumber'
  >,
  nowMs: number
): string {
  if (req.idempotencyKey) return req.idempotencyKey;
  if (req.kind === 'recovery') return recoveryMessageSid(req.leadId);
  if (
    req.kind === 'campaign' &&
    req.enrollmentId &&
    req.campaignId &&
    req.stepNumber
  ) {
    return campaignStepMessageSid(
      req.enrollmentId,
      req.campaignId,
      req.stepNumber
    );
  }
  return `mlf:${req.kind}:${req.leadId}:${nowMs}`;
}

export type DuplicateSidDecision =
  | { action: 'confirm_existing'; status: string }
  | { action: 'needs_review'; reason: 'duplicate_failed' }
  | { action: 'claim_deferred' }
  | { action: 'block_in_flight'; detail: string };

export function decideDuplicateSid(
  existingStatus: string | null | undefined
): DuplicateSidDecision {
  if (isConfirmedStatus(existingStatus)) {
    return { action: 'confirm_existing', status: existingStatus! };
  }
  if (
    isFailedStatus(existingStatus) ||
    String(existingStatus ?? '').toLowerCase() === 'needs_review'
  ) {
    return { action: 'needs_review', reason: 'duplicate_failed' };
  }
  const st = String(existingStatus ?? '').toLowerCase();
  if (st === 'deferred' || st === 'abandoned_retry') {
    return { action: 'claim_deferred' };
  }
  return {
    action: 'block_in_flight',
    detail: existingStatus ?? 'missing',
  };
}

export function mapRelaySendResult(result: {
  conflict?: boolean;
  ambiguous?: boolean;
  status?: string;
  id: string;
  keyEchoed?: boolean;
  duplicate?: boolean;
}): RelaySendSignal {
  if (result.conflict) return { type: 'conflict' };
  if (result.ambiguous) {
    return result.status === 'maintenance'
      ? { type: 'maintenance' }
      : { type: 'rate_limit' };
  }
  if (isFailedStatus(result.status)) {
    return { type: 'failed', status: result.status };
  }
  return {
    type: 'ok',
    messageId: result.id,
    status: result.status || 'queued',
    keyEchoed: Boolean(result.keyEchoed),
    duplicate: result.duplicate,
  };
}

export function classifyStatusRow(
  status: string | null | undefined
): RecoveryResolvedOutcome {
  return classifyRecoveryStatus(status);
}

export type CampaignSendAction =
  | { type: 'advance' }
  | { type: 'release'; nextSendAt: string; ok: boolean }
  | { type: 'park'; nextSendAt?: string }
  | { type: 'pause_opt_out' }
  | { type: 'needs_review_terminal'; reason: string }
  | { type: 'flag_unresolved_tz'; nextSendAt: string }
  | { type: 'noop_false' };

/** Pure interpretation of sendMessage outcome for a campaign step. */
export function interpretCampaignSendOutcome(
  outcome: SendOutcome,
  parkedFallbackIso: string
): CampaignSendAction {
  if (
    outcome.kind === 'skipped' &&
    outcome.reason === 'recovery_already_sent_skip_step_1'
  ) {
    return { type: 'advance' };
  }
  if (outcome.kind === 'blocked') {
    if (outcome.reason === 'quiet_hours_deferred' && outcome.nextSendAt) {
      return { type: 'release', nextSendAt: outcome.nextSendAt, ok: true };
    }
    if (outcome.reason === 'quiet_hours_unresolved') {
      return { type: 'flag_unresolved_tz', nextSendAt: parkedFallbackIso };
    }
    if (outcome.reason === 'recovery_pending') {
      return { type: 'park' };
    }
    if (outcome.reason === 'suppressed' || outcome.reason === 'opted_out') {
      return { type: 'pause_opt_out' };
    }
    if (outcome.reason === 'sends_disabled') {
      // Count as error for cron metrics; still release claim for retry.
      return { type: 'release', nextSendAt: parkedFallbackIso, ok: false };
    }
    if (outcome.reason === 'duplicate_in_flight') {
      return { type: 'park' };
    }
    return { type: 'noop_false' };
  }
  if (outcome.kind === 'sent') return { type: 'advance' };
  if (outcome.kind === 'needs_review') {
    return { type: 'needs_review_terminal', reason: outcome.reason };
  }
  if (outcome.kind === 'ambiguous') {
    return {
      type: 'park',
      nextSendAt: outcome.nextRetryAt ?? parkedFallbackIso,
    };
  }
  return { type: 'park' };
}

export type RecoveryOutcomeAction =
  | { type: 'persist_deferred'; nextSendAt: string }
  | { type: 'log_blocked'; reason: string }
  | { type: 'log_needs_review'; sid: string }
  | { type: 'log_ambiguous'; reason: string }
  | { type: 'log_sent'; sid: string };

export function interpretRecoverySendOutcome(
  outcome: SendOutcome,
  fallbackDeferIso: string
): RecoveryOutcomeAction {
  if (outcome.kind === 'blocked' && outcome.reason === 'quiet_hours_deferred') {
    return {
      type: 'persist_deferred',
      nextSendAt: outcome.nextSendAt ?? fallbackDeferIso,
    };
  }
  if (outcome.kind === 'blocked') {
    return { type: 'log_blocked', reason: String(outcome.reason) };
  }
  if (outcome.kind === 'skipped') {
    return { type: 'log_blocked', reason: String(outcome.reason) };
  }
  if (outcome.kind === 'needs_review') {
    return { type: 'log_needs_review', sid: outcome.sid };
  }
  if (outcome.kind === 'ambiguous') {
    return { type: 'log_ambiguous', reason: outcome.reason };
  }
  if (outcome.kind === 'sent') {
    return { type: 'log_sent', sid: outcome.sid };
  }
  return { type: 'log_blocked', reason: 'unexpected' };
}

export type DeferredRowAction =
  | { type: 'count_sent' }
  | { type: 're_defer'; nextSendAt: string }
  | { type: 'abandon' }
  | { type: 'count_parked' }
  | { type: 'ignore' };

/**
 * Pure interpretation of a sendMessage outcome while draining deferred recoveries.
 */
export function interpretDeferredRowOutcome(
  outcome: SendOutcome,
  fallbackDeferIso: string
): DeferredRowAction {
  if (
    outcome.kind === 'blocked' &&
    outcome.reason === 'quiet_hours_deferred'
  ) {
    return {
      type: 're_defer',
      nextSendAt: outcome.nextSendAt ?? fallbackDeferIso,
    };
  }
  if (outcome.kind === 'sent') {
    return { type: 'count_sent' };
  }
  if (outcome.kind === 'blocked' || outcome.kind === 'skipped') {
    return { type: 'abandon' };
  }
  if (outcome.kind === 'ambiguous' || outcome.kind === 'needs_review') {
    return { type: 'count_parked' };
  }
  return { type: 'ignore' };
}
