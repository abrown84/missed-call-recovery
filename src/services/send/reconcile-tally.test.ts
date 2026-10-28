import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { SMS_STATUS } from '@/services/db-strings';
import {
  abandonedSid,
  coalesceLookupOutcome,
  coalesceReconcileAttempts,
  decideReconcileAlert,
  emptyReconcileCounts,
  noteReconcileOutcome,
  noteReconcileRowStatus,
  signalFromLookupOutcome,
} from './reconcile-tally';

describe('coalesce helpers', () => {
  it('coalesceReconcileAttempts uses 0 for null/undefined (not && 0)', () => {
    expect(coalesceReconcileAttempts(3)).toBe(3);
    expect(coalesceReconcileAttempts(null)).toBe(0);
    expect(coalesceReconcileAttempts(undefined)).toBe(0);
    // attempts && 0 would yield 0 for any truthy attempts
    expect(coalesceReconcileAttempts(7)).toBe(7);
  });

  it('coalesceLookupOutcome prefers explicit outcome over classify', () => {
    expect(
      coalesceLookupOutcome({ outcome: 'sent', status: 'queued', found: true })
    ).toBe('sent');
    // missing outcome → classify body (found:false → never_sent typically)
    const classified = coalesceLookupOutcome({ found: false });
    expect(typeof classified).toBe('string');
    expect(classified.length).toBeGreaterThan(0);
  });
});

describe('reconcile-tally', () => {
  it('notes unknown vs sending status exactly once each', () => {
    let c = emptyReconcileCounts();
    c = noteReconcileRowStatus(c, SMS_STATUS.unknown);
    c = noteReconcileRowStatus(c, SMS_STATUS.sending);
    c = noteReconcileRowStatus(c, SMS_STATUS.queued);
    expect(c.unknownCount).toBe(1);
    expect(c.stuckSendingCount).toBe(1);
  });

  it('notes each outcome kind independently (not -= mutants)', () => {
    let c = emptyReconcileCounts();
    c = noteReconcileOutcome(c, 'resolved');
    c = noteReconcileOutcome(c, 'never_sent');
    c = noteReconcileOutcome(c, 'needs_review');
    c = noteReconcileOutcome(c, 'ambiguous');
    c = noteReconcileOutcome(c, 'blocked');
    expect(c).toEqual({
      unknownCount: 0,
      stuckSendingCount: 0,
      confirmed: 1,
      requeued: 1,
      needsReview: 1,
      parked: 1,
    });
  });

  it('alert when threshold met OR needsReview > 0', () => {
    expect(
      decideReconcileAlert(
        { ...emptyReconcileCounts(), unknownCount: 5 },
        5
      )
    ).toBe(true);
    expect(
      decideReconcileAlert(
        { ...emptyReconcileCounts(), unknownCount: 4 },
        5
      )
    ).toBe(false);
    expect(
      decideReconcileAlert(
        { ...emptyReconcileCounts(), needsReview: 1 },
        99
      )
    ).toBe(true);
    // >= not > : exactly threshold alerts
    expect(
      decideReconcileAlert(
        { ...emptyReconcileCounts(), stuckSendingCount: 3 },
        3
      )
    ).toBe(true);
    // sum, not difference
    expect(
      decideReconcileAlert(
        { ...emptyReconcileCounts(), unknownCount: 2, stuckSendingCount: 2 },
        4
      )
    ).toBe(true);
  });

  it('signalFromLookupOutcome covers sent/failed/never_sent/unknown', () => {
    expect(signalFromLookupOutcome('sent', { status: 'delivered' })).toEqual({
      type: 'sent',
      status: 'delivered',
    });
    expect(signalFromLookupOutcome('sent', {})).toEqual({
      type: 'sent',
      status: SMS_STATUS.queued,
    });
    expect(signalFromLookupOutcome('failed', { status: 500 })).toEqual({
      type: 'failed',
      status: '500',
    });
    expect(signalFromLookupOutcome('failed', {})).toEqual({
      type: 'failed',
      status: 'failed',
    });
    expect(signalFromLookupOutcome('never_sent', {})).toEqual({
      type: 'never_sent',
    });
    expect(signalFromLookupOutcome('other', {})).toEqual({ type: 'unknown' });
  });

  it('abandonedSid embeds original + timestamp (non-empty)', () => {
    expect(abandonedSid('mlf:recovery:L', 42)).toBe(
      'mlf:recovery:L:abandoned:42'
    );
    expect(abandonedSid('', 1)).toBe(':abandoned:1');
  });

  it('property: outcome note is additive and kind-specific', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'resolved',
          'never_sent',
          'needs_review',
          'ambiguous',
          'other'
        ),
        fc.nat({ max: 20 }),
        (kind, n) => {
          let c = emptyReconcileCounts();
          for (let i = 0; i < n; i++) c = noteReconcileOutcome(c, kind);
          const expected =
            kind === 'resolved'
              ? n
              : kind === 'never_sent'
                ? n
                : kind === 'needs_review'
                  ? n
                  : kind === 'ambiguous'
                    ? n
                    : 0;
          const field =
            kind === 'resolved'
              ? c.confirmed
              : kind === 'never_sent'
                ? c.requeued
                : kind === 'needs_review'
                  ? c.needsReview
                  : kind === 'ambiguous'
                    ? c.parked
                    : 0;
          expect(field).toBe(expected);
        }
      )
    );
  });
});
