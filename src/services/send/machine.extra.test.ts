import { describe, expect, it } from 'vitest';
import {
  MAX_RECONCILE_ATTEMPTS,
  parkDelayMs,
  PARK_BASE_MS,
  PARK_MAX_MS,
  parkNextAt,
  transitionSend,
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

  it('conflict / failed signal / error / maintenance / rate_limit reasons', () => {
    expect(
      transitionSend({
        kind: 'send_result',
        signal: { type: 'conflict' },
        capsBeforeSend: true,
      }).action
    ).toBe('needs_review');
    expect(
      transitionSend({
        kind: 'send_result',
        signal: { type: 'failed' },
        capsBeforeSend: true,
      })
    ).toMatchObject({ reason: 'relay_failed' });
    expect(
      transitionSend({
        kind: 'send_result',
        signal: { type: 'maintenance' },
        capsBeforeSend: true,
      })
    ).toMatchObject({ action: 'park_ambiguous', reason: 'maintenance' });
    expect(
      transitionSend({
        kind: 'send_result',
        signal: { type: 'rate_limit' },
        capsBeforeSend: true,
      })
    ).toMatchObject({ action: 'park_ambiguous', reason: 'recent_send' });
    expect(
      transitionSend({
        kind: 'send_result',
        signal: { type: 'error' },
        capsBeforeSend: true,
      })
    ).toMatchObject({ action: 'park_ambiguous', reason: 'send_error' });
  });

  it('ok without status defaults providerStatus to queued', () => {
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
    expect(d).toMatchObject({
      action: 'confirm_sent',
      providerStatus: 'queued',
      keySupportedAtSend: true,
    });
  });

  it('parkNextAt moves forward by parkDelayMs', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(parkNextAt(0, now).getTime()).toBe(now.getTime() + PARK_BASE_MS);
    expect(parkNextAt(1, now).getTime()).toBe(now.getTime() + PARK_BASE_MS * 2);
    expect(parkDelayMs(100)).toBe(PARK_MAX_MS);
  });

  it('lookup unknown increments attempts; max → needs_review max_attempts', () => {
    const park = transitionSend({
      kind: 'lookup',
      signal: { type: 'unknown' },
      keySupportedAtSend: true,
      attempts: 0,
    });
    expect(park).toMatchObject({
      action: 'park_ambiguous',
      reason: 'lookup_unknown',
      nextAttempts: 1,
    });
    const done = transitionSend({
      kind: 'lookup',
      signal: { type: 'unknown' },
      keySupportedAtSend: true,
      attempts: MAX_RECONCILE_ATTEMPTS - 1,
    });
    expect(done).toMatchObject({
      action: 'needs_review',
      reason: 'max_attempts',
    });
  });

  it('status classifiers are strict', async () => {
    const {
      isConfirmedStatus,
      isAmbiguousStatus,
      isFailedStatus,
      classifyRecoveryStatus,
    } = await import('./machine');
    expect(isConfirmedStatus('queued')).toBe(true);
    expect(isConfirmedStatus('sending')).toBe(false);
    expect(isConfirmedStatus(null)).toBe(false);
    expect(isAmbiguousStatus('unknown')).toBe(true);
    expect(isAmbiguousStatus('queued')).toBe(false);
    expect(isFailedStatus('failed')).toBe(true);
    expect(isFailedStatus('FAILED')).toBe(true);
    expect(isFailedStatus('queued')).toBe(false);
    expect(classifyRecoveryStatus('needs_review')).toBe('pending');
    expect(classifyRecoveryStatus('abandoned_retry')).toBe('resolved_abandoned');
    expect(classifyRecoveryStatus('queued')).toBe('resolved_sent');
    expect(classifyRecoveryStatus(null)).toBe('absent');
  });

  it('lookup sent resolves; failed status on sent → needs_review', () => {
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'sent', status: 'delivered' },
        keySupportedAtSend: false,
        attempts: 0,
      })
    ).toMatchObject({ action: 'resolved', providerStatus: 'delivered' });
    expect(
      transitionSend({
        kind: 'lookup',
        signal: { type: 'sent', status: 'failed' },
        keySupportedAtSend: true,
        attempts: 0,
      })
    ).toMatchObject({
      action: 'needs_review',
      reason: 'relay_status_failed',
    });
  });
});
