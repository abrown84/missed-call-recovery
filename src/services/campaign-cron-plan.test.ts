import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  decideClaimTokenResult,
  emptyDueCounts,
  noteClaimSkip,
  noteExtraRequeue,
  noteSendFailure,
  noteSendSuccess,
  staleClaimCutoffIso,
} from './campaign-cron-plan';

describe('campaign-cron-plan', () => {
  it('due counts bump independently (not -=)', () => {
    let c = emptyDueCounts();
    c = noteClaimSkip(c);
    c = noteSendSuccess(c);
    c = noteSendFailure(c);
    expect(c).toEqual({ processed: 1, errors: 1, skipped: 1 });
  });

  it('decideClaimTokenResult prefers due then stale; null otherwise', () => {
    expect(
      decideClaimTokenResult({
        dueError: false,
        dueCount: 1,
        staleError: true,
        staleCount: 0,
        token: 't',
      })
    ).toBe('t');
    expect(
      decideClaimTokenResult({
        dueError: true,
        dueCount: 0,
        staleError: false,
        staleCount: 1,
        token: 't2',
      })
    ).toBe('t2');
    expect(
      decideClaimTokenResult({
        dueError: false,
        dueCount: 0,
        staleError: false,
        staleCount: 0,
        token: 't',
      })
    ).toBeNull();
    // dueError true even with dueCount>0 must fall through to stale
    expect(
      decideClaimTokenResult({
        dueError: true,
        dueCount: 5,
        staleError: false,
        staleCount: 1,
        token: 'tok',
      })
    ).toBe('tok');
  });

  it('staleClaimCutoffIso subtracts (not adds)', () => {
    expect(staleClaimCutoffIso(10_000, 3_000)).toBe(
      new Date(7_000).toISOString()
    );
    expect(staleClaimCutoffIso(10_000, 3_000)).not.toBe(
      new Date(13_000).toISOString()
    );
  });

  it('noteExtraRequeue only increments on ok', () => {
    expect(noteExtraRequeue(0, true)).toBe(1);
    expect(noteExtraRequeue(3, false)).toBe(3);
  });

  it('property: success/failure/skip are additive', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10 }),
        fc.nat({ max: 10 }),
        fc.nat({ max: 10 }),
        (s, e, k) => {
          let c = emptyDueCounts();
          for (let i = 0; i < s; i++) c = noteSendSuccess(c);
          for (let i = 0; i < e; i++) c = noteSendFailure(c);
          for (let i = 0; i < k; i++) c = noteClaimSkip(c);
          expect(c.processed).toBe(s);
          expect(c.errors).toBe(e);
          expect(c.skipped).toBe(k);
        }
      ),
      { numRuns: 30 }
    );
  });
});
