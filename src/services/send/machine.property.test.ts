/**
 * Property-based tests for the send/reconcile state machine.
 */
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  MAX_RECONCILE_ATTEMPTS,
  parkDelayMs,
  PARK_BASE_MS,
  PARK_MAX_MS,
  transitionSend,
  classifyRecoveryStatus,
  type RelayLookupSignal,
  type RelaySendSignal,
} from './machine';

const sendSignalArb: fc.Arbitrary<RelaySendSignal> = fc.oneof(
  fc.record({
    type: fc.constant('ok' as const),
    messageId: fc.string({ minLength: 1 }),
    status: fc.constantFrom('queued', 'sent', 'delivered', 'failed'),
    keyEchoed: fc.boolean(),
    duplicate: fc.option(fc.boolean(), { nil: undefined }),
  }),
  fc.constant({ type: 'conflict' as const }),
  fc.constant({ type: 'rate_limit' as const }),
  fc.constant({ type: 'maintenance' as const }),
  fc.constant({ type: 'failed' as const, status: 'failed' }),
  fc.constant({ type: 'error' as const })
);

const lookupSignalArb: fc.Arbitrary<RelayLookupSignal> = fc.oneof(
  fc.record({
    type: fc.constant('sent' as const),
    status: fc.constantFrom('queued', 'sent', 'delivered', 'failed'),
  }),
  fc.constant({ type: 'never_sent' as const }),
  fc.constant({ type: 'failed' as const, status: 'failed' }),
  fc.constant({ type: 'unknown' as const })
);

describe('send machine properties', () => {
  it('every send_result yields a defined action', () => {
    fc.assert(
      fc.property(sendSignalArb, fc.boolean(), (signal, caps) => {
        const d = transitionSend({
          kind: 'send_result',
          signal,
          capsBeforeSend: caps,
        });
        expect(d.action).toBeTypeOf('string');
        expect(['confirm_sent', 'park_ambiguous', 'needs_review']).toContain(
          d.action
        );
      }),
      { numRuns: 200 }
    );
  });

  it('maintenance and rate_limit never become needs_review on send', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<RelaySendSignal>(
          { type: 'maintenance' },
          { type: 'rate_limit' }
        ),
        fc.boolean(),
        (signal, caps) => {
          const d = transitionSend({
            kind: 'send_result',
            signal,
            capsBeforeSend: caps,
          });
          expect(d.action).toBe('park_ambiguous');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('never_sent without key support always needs_review', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10 }), (attempts) => {
        const d = transitionSend({
          kind: 'lookup',
          signal: { type: 'never_sent' },
          keySupportedAtSend: false,
          attempts,
        });
        expect(d.action).toBe('needs_review');
      }),
      { numRuns: 50 }
    );
  });

  it('never_sent with key support always requeues', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10 }), (attempts) => {
        const d = transitionSend({
          kind: 'lookup',
          signal: { type: 'never_sent' },
          keySupportedAtSend: true,
          attempts,
        });
        expect(d.action).toBe('requeue_never_sent');
      }),
      { numRuns: 50 }
    );
  });

  it('unknown parks until max attempts then needs_review', () => {
    fc.assert(
      fc.property(fc.nat({ max: MAX_RECONCILE_ATTEMPTS + 3 }), (attempts) => {
        const d = transitionSend({
          kind: 'lookup',
          signal: { type: 'unknown' },
          keySupportedAtSend: true,
          attempts,
        });
        if (attempts + 1 >= MAX_RECONCILE_ATTEMPTS) {
          expect(d.action).toBe('needs_review');
        } else {
          expect(d.action).toBe('park_ambiguous');
        }
      }),
      { numRuns: 40 }
    );
  });

  it('failed lookup never requeues', () => {
    fc.assert(
      fc.property(lookupSignalArb, fc.boolean(), fc.nat({ max: 5 }), (signal, key, attempts) => {
        fc.pre(signal.type === 'failed' || (signal.type === 'sent' && signal.status === 'failed'));
        const d = transitionSend({
          kind: 'lookup',
          signal,
          keySupportedAtSend: key,
          attempts,
        });
        expect(d.action).toBe('needs_review');
      }),
      { numRuns: 100 }
    );
  });

  it('park delay is exponential and capped', () => {
    fc.assert(
      fc.property(fc.nat({ max: 20 }), (n) => {
        const d = parkDelayMs(n);
        expect(d).toBeGreaterThanOrEqual(PARK_BASE_MS);
        expect(d).toBeLessThanOrEqual(PARK_MAX_MS);
        expect(d).toBe(Math.min(PARK_BASE_MS * 2 ** n, PARK_MAX_MS));
      }),
      { numRuns: 30 }
    );
  });

  it('classifyRecoveryStatus is total', () => {
    fc.assert(
      fc.property(
        fc.option(
          fc.constantFrom(
            'queued',
            'sent',
            'sending',
            'unknown',
            'needs_review',
            'failed',
            'abandoned_retry',
            'weird'
          ),
          { nil: null }
        ),
        (status) => {
          const r = classifyRecoveryStatus(status);
          expect([
            'resolved_sent',
            'resolved_abandoned',
            'pending',
            'absent',
          ]).toContain(r);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('ok+caps+echo sets keySupportedAtSend true; missing either → false', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (caps, echo) => {
        const d = transitionSend({
          kind: 'send_result',
          signal: {
            type: 'ok',
            messageId: 'm',
            status: 'queued',
            keyEchoed: echo,
          },
          capsBeforeSend: caps,
        });
        if (d.action === 'confirm_sent') {
          expect(d.keySupportedAtSend).toBe(caps && echo);
        }
      }),
      { numRuns: 40 }
    );
  });
});
