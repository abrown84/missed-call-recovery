// @ts-nocheck
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  MAX_RECONCILE_ATTEMPTS,
  parkDelayMs,
  PARK_BASE_MS,
  PARK_MAX_MS,
  parkNextAt,
  transitionSend,
  isConfirmedStatus,
  isAmbiguousStatus,
  isFailedStatus,
  classifyRecoveryStatus,
} from './machine';

describe('send machine kill-mutants', () => {
  it('duplicate+failed → needs_review with reason duplicate_failed', () => {
    const d = transitionSend({
      kind: 'send_result',
      signal: {
        type: 'ok',
        messageId: 'm',
        status: 'failed',
        keyEchoed: true,
        duplicate: true,
      },
      capsBeforeSend: true,
    });
    expect(d).toEqual({
      action: 'needs_review',
      reason: 'duplicate_failed',
      phase: 'needs_review',
    });
  });

  it('failed status without duplicate → relay_failed', () => {
    expect(
      transitionSend({
        kind: 'send_result',
        signal: {
          type: 'ok',
          messageId: 'm',
          status: 'failed',
          keyEchoed: false,
        },
        capsBeforeSend: false,
      })
    ).toEqual({
      action: 'needs_review',
      reason: 'relay_failed',
      phase: 'needs_review',
    });
  });

  it('every send_result reason/phase string is exact', () => {
    expect(
      transitionSend({
        kind: 'send_result',
        signal: { type: 'conflict' },
        capsBeforeSend: true,
      })
    ).toEqual({
      action: 'needs_review',
      reason: 'idempotency_conflict',
      phase: 'needs_review',
    });
    expect(
      transitionSend({
        kind: 'send_result',
        signal: { type: 'failed' },
        capsBeforeSend: true,
      })
    ).toEqual({
      action: 'needs_review',
      reason: 'relay_failed',
      phase: 'needs_review',
    });
    expect(
      transitionSend({
        kind: 'send_result',
        signal: { type: 'maintenance' },
        capsBeforeSend: true,
      })
    ).toEqual({
      action: 'park_ambiguous',
      reason: 'maintenance',
      phase: 'ambiguous',
      nextAttempts: 0,
    });
    expect(
      transitionSend({
        kind: 'send_result',
        signal: { type: 'rate_limit' },
        capsBeforeSend: true,
      })
    ).toEqual({
      action: 'park_ambiguous',
      reason: 'recent_send',
      phase: 'ambiguous',
      nextAttempts: 0,
    });
    expect(
      transitionSend({
        kind: 'send_result',
        signal: { type: 'error' },
        capsBeforeSend: true,
      })
    ).toEqual({
      action: 'park_ambiguous',
      reason: 'send_error',
      phase: 'ambiguous',
      nextAttempts: 0,
    });
  });

  it('ok confirm_sent uses phase sent and defaults empty status to queued', () => {
    const d = transitionSend({
      kind: 'send_result',
      signal: {
        type: 'ok',
        messageId: 'm',
        status: '',
        keyEchoed: true,
      },
      capsBeforeSend: true,
    });
    expect(d).toEqual({
      action: 'confirm_sent',
      providerStatus: 'queued',
      keySupportedAtSend: true,
      phase: 'sent',
    });
  });

  it('parkDelayMs: NaN/neg/0/frac/Infinity → base; positives exponential; capped', () => {
    expect(parkDelayMs(Number.NaN)).toBe(PARK_BASE_MS);
    expect(parkDelayMs(Number.POSITIVE_INFINITY)).toBe(PARK_BASE_MS);
    expect(parkDelayMs(Number.NEGATIVE_INFINITY)).toBe(PARK_BASE_MS);
    expect(parkDelayMs(-1)).toBe(PARK_BASE_MS);
    expect(parkDelayMs(-0.5)).toBe(PARK_BASE_MS);
    expect(parkDelayMs(0)).toBe(PARK_BASE_MS);
    expect(parkDelayMs(0.9)).toBe(PARK_BASE_MS); // floor → 0
    expect(parkDelayMs(1)).toBe(PARK_BASE_MS * 2);
    expect(parkDelayMs(1.9)).toBe(PARK_BASE_MS * 2); // floor → 1
    expect(parkDelayMs(2)).toBe(PARK_BASE_MS * 4);
    expect(parkDelayMs(100)).toBe(PARK_MAX_MS);
  });

  it('parkNextAt moves forward by parkDelayMs', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(parkNextAt(0, now).getTime()).toBe(now.getTime() + PARK_BASE_MS);
    expect(parkNextAt(1, now).getTime()).toBe(now.getTime() + PARK_BASE_MS * 2);
  });

  it('lookup unknown increments attempts; max → needs_review max_attempts', () => {
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'unknown' },
        keySupportedAtSend: true,
        attempts: 0,
      })
    ).toEqual({
      action: 'park_ambiguous',
      reason: 'lookup_unknown',
      phase: 'ambiguous',
      nextAttempts: 1,
    });
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'unknown' },
        keySupportedAtSend: true,
        attempts: MAX_RECONCILE_ATTEMPTS - 1,
      })
    ).toEqual({
      action: 'needs_review',
      reason: 'max_attempts',
      phase: 'needs_review',
    });
  });

  it('lookup sent nonterminal parks with lookup_nonterminal; max → max_attempts', () => {
    for (const status of ['sending', 'pending', 'deferred', 'unknown', 'weird']) {
      expect(
        transitionSend({
          kind: 'lookup',
          signal: { type: 'sent', status },
          keySupportedAtSend: true,
          attempts: 0,
        }),
        status
      ).toEqual({
        action: 'park_ambiguous',
        reason: 'lookup_nonterminal',
        phase: 'ambiguous',
        nextAttempts: 1,
      });
    }
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'sent', status: 'sending' },
        keySupportedAtSend: true,
        attempts: MAX_RECONCILE_ATTEMPTS - 1,
      })
    ).toEqual({
      action: 'needs_review',
      reason: 'max_attempts',
      phase: 'needs_review',
    });
    // ConditionalExpression false on !isConfirmedStatus must still park
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'sent', status: 'pending' },
        keySupportedAtSend: false,
        attempts: 2,
      }).action
    ).toBe('park_ambiguous');
  });

  it('lookup sent resolves confirmed; empty status → queued; failed → relay_status_failed', () => {
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'sent', status: 'delivered' },
        keySupportedAtSend: false,
        attempts: 0,
      })
    ).toEqual({
      action: 'resolved',
      providerStatus: 'delivered',
      phase: 'resolved',
    });
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'sent', status: '' },
        keySupportedAtSend: true,
        attempts: 0,
      })
    ).toEqual({
      action: 'park_ambiguous',
      reason: 'lookup_nonterminal',
      phase: 'ambiguous',
      nextAttempts: 1,
    });
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'sent', status: 'failed' },
        keySupportedAtSend: true,
        attempts: 0,
      })
    ).toEqual({
      action: 'needs_review',
      reason: 'relay_status_failed',
      phase: 'needs_review',
    });
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'failed', status: 'undelivered' },
        keySupportedAtSend: true,
        attempts: 0,
      })
    ).toEqual({
      action: 'needs_review',
      reason: 'relay_status_failed',
      phase: 'needs_review',
    });
  });

  it('never_sent reasons and phases are exact', () => {
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'never_sent' },
        keySupportedAtSend: false,
        attempts: 0,
      })
    ).toEqual({
      action: 'needs_review',
      reason: 'never_sent_without_key_support',
      phase: 'needs_review',
    });
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'never_sent' },
        keySupportedAtSend: true,
        attempts: 3,
      })
    ).toEqual({
      action: 'requeue_never_sent',
      phase: 'never_sent',
    });
  });

  it('isAmbiguousStatus covers sending/unknown/deferred/pending only', () => {
    expect(isAmbiguousStatus('sending')).toBe(true);
    expect(isAmbiguousStatus('SENDING')).toBe(true);
    expect(isAmbiguousStatus('unknown')).toBe(true);
    expect(isAmbiguousStatus('deferred')).toBe(true);
    expect(isAmbiguousStatus('pending')).toBe(true);
    expect(isAmbiguousStatus('queued')).toBe(false);
    expect(isAmbiguousStatus('sent')).toBe(false);
    expect(isAmbiguousStatus('failed')).toBe(false);
    expect(isAmbiguousStatus(null)).toBe(false);
    expect(isAmbiguousStatus(undefined)).toBe(false);
    expect(isAmbiguousStatus('')).toBe(false);
  });

  it('isConfirmedStatus / isFailedStatus vocabularies', () => {
    for (const s of ['queued', 'dispatched', 'sent', 'delivered', 'QUEUED']) {
      expect(isConfirmedStatus(s), s).toBe(true);
    }
    for (const s of ['failed', 'undelivered', 'rejected', 'error', 'FAILED']) {
      expect(isFailedStatus(s), s).toBe(true);
    }
    expect(isConfirmedStatus(null)).toBe(false);
    expect(isFailedStatus(undefined)).toBe(false);
    expect(isConfirmedStatus('sending')).toBe(false);
    expect(isFailedStatus('queued')).toBe(false);
  });

  it('classifyRecoveryStatus: every status incl unknown vocab → pending', () => {
    expect(classifyRecoveryStatus(null)).toBe('absent');
    expect(classifyRecoveryStatus(undefined)).toBe('absent');
    expect(classifyRecoveryStatus('')).toBe('absent');
    for (const s of ['queued', 'dispatched', 'sent', 'delivered']) {
      expect(classifyRecoveryStatus(s), s).toBe('resolved_sent');
    }
    expect(classifyRecoveryStatus('abandoned_retry')).toBe('resolved_abandoned');
    expect(classifyRecoveryStatus('abandoned_done')).toBe('resolved_abandoned');
    for (const s of [
      'deferred',
      'sending',
      'unknown',
      'pending',
      'needs_review',
      'failed',
      'undelivered',
      'rejected',
      'error',
      'totally_unknown_vocab',
      'weird',
    ]) {
      expect(classifyRecoveryStatus(s), s).toBe('pending');
    }
  });

  it('property: parkDelayMs never below base for finite non-negative', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 30, noNaN: true }), (n) => {
        const d = parkDelayMs(n);
        expect(d).toBeGreaterThanOrEqual(PARK_BASE_MS);
        expect(d).toBeLessThanOrEqual(PARK_MAX_MS);
      }),
      { numRuns: 40 }
    );
  });
});
