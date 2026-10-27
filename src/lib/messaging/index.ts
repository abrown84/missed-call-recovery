import type { MessagingAdapter } from './types';
import { BrwnRelayAdapter } from './brwn-relay';
import { DryRunAdapter } from './dry-run';

let cached: MessagingAdapter | null = null;

/**
 * Resolve the active messaging adapter.
 * Default: BRWN Text relay. Staging/tests: MESSAGING_PROVIDER=dry-run
 * (never hits the relay / carrier).
 */
export function getMessagingAdapter(): MessagingAdapter {
  if (cached) return cached;

  const provider = (process.env.MESSAGING_PROVIDER || 'brwn-relay')
    .trim()
    .toLowerCase();

  if (provider === 'dry-run') {
    cached = new DryRunAdapter();
    return cached;
  }

  if (provider !== 'brwn-relay') {
    throw new Error(
      `Unsupported MESSAGING_PROVIDER="${provider}". Supported: brwn-relay, dry-run`
    );
  }

  cached = new BrwnRelayAdapter();
  return cached;
}

/** Test helper — clear cached adapter between cases. */
export function resetMessagingAdapterCache(): void {
  cached = null;
}

export type { MessagingAdapter, SendMessageInput, SendMessageResult } from './types';
export { BrwnRelayAdapter } from './brwn-relay';
export { DryRunAdapter } from './dry-run';
export { authorizeBrwnWebhook, bearerMatches } from './auth';
