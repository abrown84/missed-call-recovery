// @ts-nocheck
import {
  classifyRelayLookupResponse,
  isRelayKeySupportConfirmed,
  markRelayKeySupportConfirmed,
} from '@/services/sms-sid';
import type {
  IdempotencyLookupResult,
  MessagingAdapter,
  RelayCapabilities,
  RelayLookupSupport,
  SendMessageInput,
  SendMessageResult,
} from './types';

const DEFAULT_TIMEOUT_MS = 15_000;

/** Minimum relay version for capabilities + safe requeue. */
export const BRWN_RELAY_MIN_VERSION_FOR_REQUEUE = '1.7.6';

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
 * BRWN Text relay adapter (FastAPI >= 1.7.6).
 *
 * GET /api/capabilities → { relay, version, idempotency: true }
 *
 * POST /api/messages JSON: { to, body, auto, idempotencyKey? }
 *   200 → { id, status, duplicate?, idempotencyKey? }  (echoes key when keyed)
 *   429 → { error: 'recent_send' }
 *   409 → { error: 'idempotency_conflict', idempotencyKey }
 *
 * GET /api/messages?idempotencyKey=<key>
 *   200 → { found: false } | { found: true, id, toLast4, status, error, created, updated, attempts, auto }
 *   405 / 404 → unknown
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
        // Contract: { error: 'recent_send' }
        if (input.idempotencyKey) {
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

      if (res.status === 503) {
        // Freeze: { error: 'maintenance' } — park, never count as failure.
        const obj = json as { error?: string };
        console.warn(
          `BRWN relay 503 maintenance on send (${input.idempotencyKey ?? 'unkeyed'}); parking`
        );
        return {
          id: `maintenance:${input.idempotencyKey ?? 'none'}`,
          status: 'maintenance',
          ambiguous: true,
        };
      }

      if (res.status === 409) {
        // { error: 'idempotency_conflict', idempotencyKey }
        const obj = json as { error?: string; idempotencyKey?: string };
        console.error(
          `ALERT: BRWN relay 409 idempotency_conflict key=${obj.idempotencyKey ?? input.idempotencyKey ?? '(none)'}`
        );
        return {
          id: `conflict:${obj.idempotencyKey ?? input.idempotencyKey ?? 'unknown'}`,
          status: 'failed',
          conflict: true,
        };
      }

      if (!res.ok) {
        throw new Error(`BRWN relay HTTP ${res.status}`);
      }

      const obj = json as {
        id?: string;
        status?: string;
        duplicate?: boolean;
        idempotencyKey?: string;
      };
      const id = obj?.id;
      const status = obj?.status || 'queued';
      if (!id) {
        throw new Error('BRWN relay returned no message id');
      }

      const keyEchoed =
        Boolean(input.idempotencyKey) &&
        obj.idempotencyKey === input.idempotencyKey;

      return {
        id,
        status,
        ...(obj.duplicate === true ? { duplicate: true } : {}),
        ...(keyEchoed ? { keyEchoed: true } : {}),
      };
    } finally {
      clearTimeout(timer);
    }
  }

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

      if (outcome === 'sent' || outcome === 'failed') {
        const obj = (body && typeof body === 'object' && !Array.isArray(body)
          ? body
          : {}) as { id?: string; status?: string; toLast4?: string };
        return {
          outcome,
          found: true,
          id: String(obj.id || 'unknown'),
          status: obj.status || (outcome === 'failed' ? 'failed' : 'queued'),
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
   * GET /api/capabilities → { relay, version, idempotency: true }
   * This is the authoritative probe for key support (relay >= 1.7.6).
   */
  async checkLookupSupport(): Promise<RelayLookupSupport> {
    const baseUrl = getRelayUrl();
    const token = getSenderToken();
    const timeoutMs = getTimeoutMs();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${baseUrl}/api/capabilities`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (res.status === 404 || res.status === 405) {
        return {
          supported: false,
          reason: `GET /api/capabilities returned HTTP ${res.status}. Upgrade BRWN Text relay to >= ${BRWN_RELAY_MIN_VERSION_FOR_REQUEUE}.`,
          httpStatus: res.status,
        };
      }

      if (res.status < 200 || res.status >= 300) {
        return {
          supported: false,
          reason: `GET /api/capabilities HTTP ${res.status}`,
          httpStatus: res.status,
        };
      }

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return {
          supported: false,
          reason: 'GET /api/capabilities returned unexpected body',
          httpStatus: res.status,
        };
      }

      const caps = body as RelayCapabilities & Record<string, unknown>;
      if (caps.idempotency === true) {
        markRelayKeySupportConfirmed();
        return {
          supported: true,
          capabilities: {
            relay: typeof caps.relay === 'string' ? caps.relay : undefined,
            version: typeof caps.version === 'string' ? caps.version : undefined,
            idempotency: true,
          },
        };
      }

      return {
        supported: false,
        reason: `GET /api/capabilities idempotency!=true (version=${String(caps.version ?? '?')}). Need relay >= ${BRWN_RELAY_MIN_VERSION_FOR_REQUEUE}.`,
        httpStatus: res.status,
      };
    } catch (err) {
      return {
        supported: false,
        reason: `GET /api/capabilities failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

let lookupWarningLogged = false;

export async function warnIfRelayLookupUnsupported(
  adapter: MessagingAdapter = new BrwnRelayAdapter()
): Promise<RelayLookupSupport> {
  if (!adapter.checkLookupSupport) {
    const result: RelayLookupSupport = {
      supported: false,
      reason: 'Messaging adapter has no checkLookupSupport / capabilities API',
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
      `ALERT: BRWN relay idempotency NOT CONFIRMED — ${result.reason}\n` +
      `Rows without key_supported_at_send will go to needs_review on found:false.\n` +
      `Upgrade to relay >= ${BRWN_RELAY_MIN_VERSION_FOR_REQUEUE} and freeze/drain before cutover.\n` +
      '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
  );
}

export function resetRelayLookupWarningFlag(): void {
  lookupWarningLogged = false;
}

/**
 * Probe GET /api/capabilities *before* a keyed send when support is not yet
 * confirmed in this process. Required so key_supported_at_send can only be
 * set when caps.idempotency was true before the send (and the response echoes
 * the key). Safe to call repeatedly — no-ops once confirmed.
 */
export async function ensureRelayKeySupportProbed(
  adapter: MessagingAdapter = new BrwnRelayAdapter()
): Promise<boolean> {
  if (isRelayKeySupportConfirmed()) return true;
  if (!adapter.checkLookupSupport) return false;
  const result = await adapter.checkLookupSupport();
  return result.supported;
}
