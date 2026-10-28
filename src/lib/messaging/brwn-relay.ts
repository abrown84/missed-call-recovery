import { classifyRelayLookupResponse } from '@/services/sms-sid';
import type {
  IdempotencyLookupResult,
  MessagingAdapter,
  RelayLookupSupport,
  SendMessageInput,
  SendMessageResult,
} from './types';

const DEFAULT_TIMEOUT_MS = 15_000;

/** Probe key used only for lookup capability checks (never a real send sid). */
export const RELAY_LOOKUP_PROBE_KEY = '__brwn_lookup_probe__';

/** Minimum relay version that supports GET lookup + idempotency requeue. */
export const BRWN_RELAY_MIN_VERSION_FOR_REQUEUE = '1.7.5';

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
 * BRWN Text relay adapter (FastAPI).
 *
 * POST /api/messages JSON body: { to, body, auto, idempotencyKey? }
 *   200 → { id, status, duplicate?: true }
 *   429 → { detail: 'recent_send' } (same number <45s, or same number+body <600s)
 *     On keyed send → ambiguous (park/reconcile), not a hard error.
 *
 * GET /api/messages?idempotencyKey=<key> (Bearer auth) — requires relay >= v1.7.5
 *   200 → { found: false } | { found: true, id, to, status, error, created, updated, attempts, auto }
 *   405 / 404 → unknown (lookup unsupported or missing)
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
      // Exact FastAPI contract field names (JSON body, not headers).
      const payload: Record<string, unknown> = {
        to: input.to,
        body: input.body,
        auto: input.auto ?? true,
      };
      if (input.idempotencyKey) {
        payload.idempotencyKey = input.idempotencyKey;
      }

      const res = await fetch(`${baseUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
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
        // FastAPI shape: { detail: 'recent_send' }
        if (input.idempotencyKey) {
          // Keyed send: park + reconcile — not a hard error.
          console.warn(
            `BRWN relay 429 recent_send on keyed send (${input.idempotencyKey}); treating as unknown`
          );
          return {
            id: `rate-limited:${input.idempotencyKey}`,
            status: 'unknown',
            ambiguous: true,
          };
        }
        throw new Error('BRWN relay rate-limited send (recent_send)');
      }

      if (!res.ok) {
        throw new Error(`BRWN relay HTTP ${res.status}`);
      }

      const obj = json as {
        id?: string;
        status?: string;
        duplicate?: boolean;
      };
      const id = obj?.id;
      const status = obj?.status || 'queued';
      if (!id) {
        throw new Error('BRWN relay returned no message id');
      }

      return {
        id,
        status,
        ...(obj.duplicate === true ? { duplicate: true } : {}),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * GET /api/messages?idempotencyKey=<key>
   * Contract:
   * - 200 + { found: false } → never_sent
   * - 200 + { found: true, id, … } → sent
   * - 404 / 405 / other → unknown
   */
  async lookupByIdempotencyKey(
    key: string
  ): Promise<IdempotencyLookupResult> {
    const baseUrl = getRelayUrl();
    const token = getSenderToken();
    const timeoutMs = getTimeoutMs();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = new URL(`${baseUrl}/api/messages`);
      url.searchParams.set('idempotencyKey', key);
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      const outcome = classifyRelayLookupResponse({
        httpStatus: res.status,
        body,
      });

      if (outcome === 'sent') {
        const obj = (body && typeof body === 'object' && !Array.isArray(body)
          ? body
          : {}) as { id?: string; status?: string };
        return {
          outcome: 'sent',
          found: true,
          id: String(obj.id || 'unknown'),
          status: obj.status || 'queued',
        };
      }
      if (outcome === 'never_sent') {
        return { outcome: 'never_sent', found: false };
      }
      return { outcome: 'unknown', found: false };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Probe GET lookup support. Older relays return 405 Method Not Allowed.
   */
  async checkLookupSupport(): Promise<RelayLookupSupport> {
    const baseUrl = getRelayUrl();
    const token = getSenderToken();
    const timeoutMs = getTimeoutMs();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = new URL(`${baseUrl}/api/messages`);
      url.searchParams.set('idempotencyKey', RELAY_LOOKUP_PROBE_KEY);
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (res.status === 405 || res.status === 404) {
        return {
          supported: false,
          reason:
            res.status === 405
              ? `GET /api/messages?idempotencyKey not allowed (HTTP 405). Upgrade BRWN Text relay to >= ${BRWN_RELAY_MIN_VERSION_FOR_REQUEUE} for requeue.`
              : `GET /api/messages?idempotencyKey returned 404. Upgrade BRWN Text relay to >= ${BRWN_RELAY_MIN_VERSION_FOR_REQUEUE} for requeue.`,
          httpStatus: res.status,
        };
      }

      if (res.status >= 200 && res.status < 300) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        if (
          body &&
          typeof body === 'object' &&
          !Array.isArray(body) &&
          'found' in (body as object)
        ) {
          return { supported: true };
        }
        return {
          supported: false,
          reason:
            'GET lookup returned 2xx without { found } — unexpected shape; parked rows cannot be reconciled safely.',
          httpStatus: res.status,
        };
      }

      return {
        supported: false,
        reason: `GET lookup HTTP ${res.status}; parked rows cannot be reconciled until relay >= ${BRWN_RELAY_MIN_VERSION_FOR_REQUEUE}.`,
        httpStatus: res.status,
      };
    } catch (err) {
      return {
        supported: false,
        reason: `GET lookup probe failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

let lookupWarningLogged = false;

/**
 * Startup/health check: loud warning when relay lookup is unsupported so
 * parked ambiguous rows are visible (cannot requeue without >= v1.7.5).
 */
export async function warnIfRelayLookupUnsupported(
  adapter: MessagingAdapter = new BrwnRelayAdapter()
): Promise<RelayLookupSupport> {
  if (!adapter.checkLookupSupport) {
    const result: RelayLookupSupport = {
      supported: false,
      reason: 'Messaging adapter has no checkLookupSupport / lookup API',
    };
    logLookupUnsupported(result);
    return result;
  }

  const result = await adapter.checkLookupSupport();
  if (!result.supported) {
    logLookupUnsupported(result);
  }
  return result;
}

function logLookupUnsupported(result: Extract<RelayLookupSupport, { supported: false }>) {
  if (lookupWarningLogged) return;
  lookupWarningLogged = true;
  console.error(
    '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n' +
      `ALERT: BRWN relay idempotency LOOKUP NOT SUPPORTED — ${result.reason}\n` +
      `Ambiguous/parked sms_messages rows will STAY PARKED until relay >= ${BRWN_RELAY_MIN_VERSION_FOR_REQUEUE}.\n` +
      '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
  );
}

/** Test helper */
export function resetRelayLookupWarningFlag(): void {
  lookupWarningLogged = false;
}
