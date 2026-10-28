import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  applyCampaignSendEffects,
  type CampaignSendEffectHandlers,
} from './campaign-send-effects';
import type { CampaignSendEffect } from './campaign-send-plan';

function trackingHandlers() {
  const calls: Array<{ op: string; arg?: unknown }> = [];
  const handlers: CampaignSendEffectHandlers = {
    advance: async (stepNumber) => {
      calls.push({ op: 'advance', arg: stepNumber });
    },
    release: async (nextSendAt) => {
      calls.push({ op: 'release', arg: nextSendAt });
    },
    flagUnresolvedTz: async (nextSendAt) => {
      calls.push({ op: 'flag_unresolved_tz', arg: nextSendAt });
    },
    park: async (nextSendAt) => {
      calls.push({ op: 'park', arg: nextSendAt });
    },
    pauseOptOut: async () => {
      calls.push({ op: 'pause_opt_out' });
    },
    needsReviewTerminal: async (reason) => {
      calls.push({ op: 'needs_review_terminal', arg: reason });
    },
    noopRelease: async () => {
      calls.push({ op: 'noop_release' });
    },
  };
  return { calls, handlers };
}

const ALL_OPS: CampaignSendEffect[] = [
  { op: 'advance', stepNumber: 3 },
  { op: 'release', nextSendAt: 't1' },
  { op: 'flag_unresolved_tz', nextSendAt: 't2' },
  { op: 'park', nextSendAt: 't3' },
  { op: 'pause_opt_out' },
  { op: 'needs_review_terminal', reason: 'dup' },
  { op: 'noop_release' },
];

describe('applyCampaignSendEffects', () => {
  it('invokes exactly one handler per effect op (kills empty case / wrong case)', async () => {
    const { calls, handlers } = trackingHandlers();
    await applyCampaignSendEffects(ALL_OPS, handlers);
    expect(calls.map((c) => c.op)).toEqual([
      'advance',
      'release',
      'flag_unresolved_tz',
      'park',
      'pause_opt_out',
      'needs_review_terminal',
      'noop_release',
    ]);
    expect(calls[0].arg).toBe(3);
    expect(calls[1].arg).toBe('t1');
    expect(calls[2].arg).toBe('t2');
    expect(calls[3].arg).toBe('t3');
    expect(calls[5].arg).toBe('dup');
  });

  it('property: every effect calls its matching handler once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray(ALL_OPS, { minLength: 1 }),
        async (effects) => {
          const { calls, handlers } = trackingHandlers();
          await applyCampaignSendEffects(effects, handlers);
          expect(calls).toHaveLength(effects.length);
          for (let i = 0; i < effects.length; i++) {
            expect(calls[i].op).toBe(effects[i].op);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it('noop on empty effects (not a stray handler call)', async () => {
    const { calls, handlers } = trackingHandlers();
    await applyCampaignSendEffects([], handlers);
    expect(calls).toEqual([]);
  });
});
