import type { MessagingAdapter } from './types';
import { BrwnRelayAdapter } from './brwn-relay';

let cached: MessagingAdapter | null = null;

/**
 * Resolve the active messaging adapter.
 * Default (and currently only) provider: BRWN Text relay.
 * Set MESSAGING_PROVIDER=brwn-relay explicitly if desired; anything else throws.
 */
export function getMessagingAdapter(): MessagingAdapter {
  if (cached) return cached;

  const provider = (process.env.MESSAGING_PROVIDER || 'brwn-relay').trim().toLowerCase();
  if (provider !== 'brwn-relay') {
    throw new Error(
      `Unsupported MESSAGING_PROVIDER="${provider}". Supported: brwn-relay`
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
export { authorizeBrwnWebhook, bearerMatches } from './auth';
