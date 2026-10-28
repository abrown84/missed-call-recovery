import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { interpretDeferredRowOutcome } from './decisions';
import type { SendOutcome } from './types';

const fallback = '2026-01-01T08:00:00.000Z';

describe('interpretDeferredRowOutcome', () => {
  it('re-defers quiet hours (uses nextSendAt or fallback)', () => {
    expect(
      interpretDeferredRowOutcome(
        {
          kind: 'blocked',
          reason: 'quiet_hours_deferred',
          nextSendAt: 't1',
        },
        fallback
      )
    ).toEqual({ type: 're_defer', nextSendAt: 't1' });
    expect(
      interpretDeferredRowOutcome(
        { kind: 'blocked', reason: 'quiet_hours_deferred' },
        fallback
      )
    ).toEqual({ type: 're_defer', nextSendAt: fallback });
  });

  it('counts sent', () => {
    expect(
      interpretDeferredRowOutcome(
        {
          kind: 'sent',
          sid: 's',
          messageId: 'm',
          providerStatus: 'queued',
          keySupportedAtSend: true,
        },
        fallback
      )
    ).toEqual({ type: 'count_sent' });
  });

  it('abandons blocked/skipped non-quiet', () => {
    expect(
      interpretDeferredRowOutcome(
        { kind: 'blocked', reason: 'suppressed' },
        fallback
      )
    ).toEqual({ type: 'abandon' });
    expect(
      interpretDeferredRowOutcome({ kind: 'skipped', reason: 'x' }, fallback)
    ).toEqual({ type: 'abandon' });
  });

  it('parks ambiguous / needs_review', () => {
    expect(
      interpretDeferredRowOutcome(
        { kind: 'ambiguous', sid: 's', reason: 'r' },
        fallback
      )
    ).toEqual({ type: 'count_parked' });
    expect(
      interpretDeferredRowOutcome(
        { kind: 'needs_review', sid: 's', reason: 'r' },
        fallback
      )
    ).toEqual({ type: 'count_parked' });
  });

  it('property: every SendOutcome kind maps to a known action', () => {
    const outcomes: SendOutcome[] = [
      { kind: 'blocked', reason: 'quiet_hours_deferred', nextSendAt: 't' },
      { kind: 'blocked', reason: 'suppressed' },
      { kind: 'skipped', reason: 'x' },
      {
        kind: 'sent',
        sid: 's',
        messageId: 'm',
        providerStatus: 'queued',
        keySupportedAtSend: true,
      },
      { kind: 'ambiguous', sid: 's', reason: 'r' },
      { kind: 'needs_review', sid: 's', reason: 'r' },
      { kind: 'never_sent', sid: 's' },
    ];
    fc.assert(
      fc.property(fc.constantFrom(...outcomes), (o) => {
        const a = interpretDeferredRowOutcome(o, fallback);
        expect([
          're_defer',
          'count_sent',
          'abandon',
          'count_parked',
          'ignore',
        ]).toContain(a.type);
      }),
      { numRuns: 40 }
    );
  });
});
