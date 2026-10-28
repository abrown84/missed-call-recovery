/**
 * Apply planned campaign-send I/O effects via injected handlers.
 * Keeps the switch decision surface thin and DI-testable.
 */

import type { CampaignSendEffect } from '@/services/campaign-send-plan';

export type CampaignSendEffectHandlers = {
  advance: (stepNumber: number) => Promise<void>;
  release: (nextSendAt?: string) => Promise<void>;
  flagUnresolvedTz: (nextSendAt?: string) => Promise<void>;
  park: (nextSendAt?: string) => Promise<void>;
  pauseOptOut: () => Promise<void>;
  needsReviewTerminal: (reason: string) => Promise<void>;
  noopRelease: () => Promise<void>;
};

/**
 * Dispatch each effect to exactly one handler. Unknown ops are ignored
 * (exhaustive switch on CampaignSendEffect — no default arm).
 */
export async function applyCampaignSendEffects(
  effects: readonly CampaignSendEffect[],
  handlers: CampaignSendEffectHandlers
): Promise<void> {
  for (const effect of effects) {
    switch (effect.op) {
      case 'advance':
        await handlers.advance(effect.stepNumber);
        break;
      case 'release':
        await handlers.release(effect.nextSendAt);
        break;
      case 'flag_unresolved_tz':
        await handlers.flagUnresolvedTz(effect.nextSendAt);
        break;
      case 'park':
        await handlers.park(effect.nextSendAt);
        break;
      case 'pause_opt_out':
        await handlers.pauseOptOut();
        break;
      case 'needs_review_terminal':
        await handlers.needsReviewTerminal(effect.reason);
        break;
      case 'noop_release':
        await handlers.noopRelease();
        break;
    }
  }
}
