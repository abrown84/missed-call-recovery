/**
 * Public typed outcomes for the single send module.
 */
// @ts-nocheck


import type { RecoveryResolvedOutcome } from './machine';

export type SendKind = 'recovery' | 'campaign' | 'escalation' | 'manual';

export type SendRequest = {
  kind: SendKind;
  leadId: string;
  businessId: string;
  /** Raw phone — module normalizes to E.164 before relay. */
  to: string;
  body: string;
  /** Stable mlf: idempotency key. Required for recovery/campaign. */
  idempotencyKey?: string;
  /** Campaign enrollment context */
  enrollmentId?: string;
  campaignId?: string;
  stepNumber?: number;
  claimToken?: string;
  /** Quiet-hours / TCPA */
  leadTimezone?: string | null;
  businessTimezone?: string | null;
  skipQuietHours?: boolean;
  /** When true, skip recovery gate (internal requeue). */
  skipRecoveryGate?: boolean;
  auto?: boolean;
};

export type SendOutcome =
  | {
      kind: 'sent';
      sid: string;
      messageId: string;
      providerStatus: string;
      keySupportedAtSend: boolean;
    }
  | { kind: 'ambiguous'; sid: string; reason: string; nextRetryAt?: string }
  | { kind: 'needs_review'; sid: string; reason: string }
  | { kind: 'never_sent'; sid: string }
  | {
      kind: 'blocked';
      reason:
        | 'sends_disabled'
        | 'quiet_hours_unresolved'
        | 'quiet_hours_deferred'
        | 'suppressed'
        | 'opted_out'
        | 'invalid_phone'
        | 'recovery_pending'
        | 'duplicate_in_flight'
        | 'claim_lost';
      nextSendAt?: string;
      detail?: string;
    }
  | { kind: 'skipped'; reason: string; nextSendAt?: string };

export type ReconcileOutcome =
  | { kind: 'resolved'; sid: string; providerStatus: string }
  | { kind: 'never_sent'; sid: string; requeued: boolean }
  | { kind: 'ambiguous'; sid: string; attempts: number; nextRetryAt: string }
  | { kind: 'needs_review'; sid: string; reason: string }
  | { kind: 'blocked'; reason: 'sends_disabled' };

export type { RecoveryResolvedOutcome };
