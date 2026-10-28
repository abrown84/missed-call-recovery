import type { MessagingAdapter, SendMessageInput, SendMessageResult } from './types';

const DEFAULT_TIMEOUT_MS = 15_000;

/** Validate and normalize a BRWN relay base URL (exported for unit tests). */
export function resolveBrwnRelayUrl(rawInput?: string): string {
  const raw = (rawInput ?? process.env.BRWN_RELAY_URL)?.trim();
  if (!raw) {
    throw new Error('BRWN_RELAY_URL is not configured');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid BRWN_RELAY_URL: not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Invalid BRWN_RELAY_URL: only http: and https: are allowed');
  }
  const host = url.hostname.toLowerCase();
  const isLoopback =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (url.protocol === 'http:' && !isLoopback) {
    throw new Error(
      'Invalid BRWN_RELAY_URL: remote relays must use https: (http: is only allowed for localhost)'
    );
  }
  return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')}`;
}

function getRelayUrl(): string {
  return resolveBrwnRelayUrl();
}

function getSenderToken(): string {
  const token = process.env.BRWN_RELAY_SENDER_TOKEN?.trim();
  if (!token) {
    throw new Error('BRWN_RELAY_SENDER_TOKEN is not configured');
  }
  if (/[\x00-\x1f\x7f]/.test(token)) {
    throw new Error('Invalid BRWN_RELAY_SENDER_TOKEN: contains control characters');
  }
  return token;
}

function getTimeoutMs(): number {
  const n = Number(process.env.BRWN_RELAY_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * BRWN Text relay adapter.
 * POST {BRWN_RELAY_URL}/api/messages with Bearer sender token.
 * The Android (or future Mac) node long-polls the relay and sends the SMS.
 */
export class BrwnRelayAdapter implements MessagingAdapter {
  readonly name = 'brwn-relay';

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const baseUrl = getRelayUrl();
    const token = getSenderToken();
    const timeoutMs = getTimeoutMs();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${baseUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: input.to,
          body: input.body,
          auto: input.auto ?? true,
          ...(input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey }
            : {}),
        }),
        signal: controller.signal,
      });

      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text.slice(0, 512) };
      }

      if (res.status === 429) {
        throw new Error('BRWN relay rate-limited send (recent_send)');
      }

      if (!res.ok) {
        throw new Error(`BRWN relay HTTP ${res.status}`);
      }

      const id = (json as { id?: string })?.id;
      const status = (json as { status?: string })?.status || 'queued';
      if (!id) {
        throw new Error('BRWN relay returned no message id');
      }

      return { id, status };
    } finally {
      clearTimeout(timer);
    }
  }
}
