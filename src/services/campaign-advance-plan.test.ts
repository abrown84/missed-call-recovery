import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  findStepByNumber,
  nextStepNumberOf,
  ownershipHit,
  planAdvanceEnrollment,
} from './campaign-advance-plan';

describe('campaign-advance-plan', () => {
  it('nextStepNumberOf adds 1 (not subtracts)', () => {
    expect(nextStepNumberOf(1)).toBe(2);
    expect(nextStepNumberOf(0)).toBe(1);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (n) => {
        expect(nextStepNumberOf(n)).toBe(n + 1);
        expect(nextStepNumberOf(n)).not.toBe(n - 1);
      }),
      { numRuns: 30 }
    );
  });

  it('findStepByNumber matches === (not !==)', () => {
    const steps = [
      { step_number: 1, delay_minutes: 0 },
      { step_number: 2, delay_minutes: 10 },
    ];
    expect(findStepByNumber(steps, 2)?.delay_minutes).toBe(10);
    expect(findStepByNumber(steps, 3)).toBeUndefined();
    // ArrowFunction → undefined mutant: must still find
    expect(findStepByNumber(steps, 1)?.step_number).toBe(1);
  });

  it('plans advance when next step exists, else complete', () => {
    const steps = [
      { step_number: 1, delay_minutes: 0 },
      { step_number: 2, delay_minutes: 15 },
    ];
    const nowMs = Date.parse('2026-06-15T12:00:00.000Z');
    const adv = planAdvanceEnrollment({
      currentStepNumber: 1,
      steps,
      nowMs,
      statusCompleted: 'completed',
    });
    expect(adv.type).toBe('advance');
    if (adv.type === 'advance') {
      expect(adv.nextStepNumber).toBe(2);
      expect(adv.payload).toMatchObject({
        current_step: 2,
        claim_token: null,
      });
      expect(adv.nextSendAt).toBe(
        new Date(nowMs + 15 * 60_000).toISOString()
      );
    }

    const done = planAdvanceEnrollment({
      currentStepNumber: 2,
      steps,
      nowMs,
      statusCompleted: 'completed',
    });
    expect(done.type).toBe('complete');
    if (done.type === 'complete') {
      expect(done.payload).toMatchObject({
        status: 'completed',
        claim_token: null,
      });
    }
  });

  it('ownershipHit requires !error AND data.length (not AND inverted)', () => {
    expect(ownershipHit(null, [{ id: 1 }])).toBe(true);
    expect(ownershipHit({ message: 'x' }, [{ id: 1 }])).toBe(false);
    expect(ownershipHit(null, [])).toBe(false);
    expect(ownershipHit(null, null)).toBe(false);
    // error && !data?.length mutant would be true when error set and empty — still false for hit
    expect(ownershipHit({ x: 1 }, [])).toBe(false);
  });
});
