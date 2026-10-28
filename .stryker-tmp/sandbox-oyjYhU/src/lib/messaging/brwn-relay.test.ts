// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BRWN_RELAY_MIN_VERSION_FOR_REQUEUE,
  BrwnRelayAdapter,
  resetRelayLookupWarningFlag,
  resolveBrwnRelayUrl,
  warnIfRelayLookupUnsupported,
} from './brwn-relay';
import { resetMessagingAdapterCache } from './index';
import { resetRelayKeySupportConfirmed } from '@/services/sms-sid';

describe('resolveBrwnRelayUrl', () => {
  it('normalizes trailing slashes', () => {
    expect(resolveBrwnRelayUrl('https://relay.example.com/')).toBe(
      'https://relay.example.com'
    );
  });
});

describe('BrwnRelayAdapter — relay 1.7.6 contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.BRWN_RELAY_URL;
    delete process.env.BRWN_RELAY_SENDER_TOKEN;
    resetMessagingAdapterCache();
    resetRelayKeySupportConfirmed();
    resetRelayLookupWarningFlag();
  });

  function setup() {
    process.env.BRWN_RELAY_URL = 'https://relay.example.com';
    process.env.BRWN_RELAY_SENDER_TOKEN = 'sender-secret';
    return new BrwnRelayAdapter();
  }

  it('GET /api/capabilities → {relay, version, idempotency:true}', async () => {
    const adapter = setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        relay: 'brwn-text',
        version: '1.7.6',
        idempotency: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const support = await adapter.checkLookupSupport();
    expect(support).toEqual({
      supported: true,
      capabilities: {
        relay: 'brwn-text',
        version: '1.7.6',
        idempotency: true,
      },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://relay.example.com/api/capabilities'
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer sender-secret'
    );
  });

  it('capabilities without idempotency → unsupported', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ relay: 'brwn-text', version: '1.7.4' }),
      })
    );
    const support = await adapter.checkLookupSupport();
    expect(support.supported).toBe(false);
  });

  it('keyed send echoes idempotencyKey; body fields exact', async () => {
    const adapter = setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 'abc',
          status: 'queued',
          idempotencyKey: 'mlf:campaign:E1:C1:step:2',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await adapter.sendMessage({
      to: '+15551234567',
      body: 'Hi',
      idempotencyKey: 'mlf:campaign:E1:C1:step:2',
    });
    expect(result.keyEchoed).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      to: '+15551234567',
      body: 'Hi',
      auto: true,
      idempotencyKey: 'mlf:campaign:E1:C1:step:2',
    });
  });

  it('429 { error: recent_send } keyed → ambiguous', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: 'recent_send' }),
      })
    );
    await expect(
      adapter.sendMessage({
        to: '+15551234567',
        body: 'Hi',
        idempotencyKey: 'mlf:k',
      })
    ).resolves.toMatchObject({ ambiguous: true, status: 'unknown' });
  });

  it('409 { error: idempotency_conflict, idempotencyKey } → conflict', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({
            error: 'idempotency_conflict',
            idempotencyKey: 'mlf:k',
          }),
      })
    );
    await expect(
      adapter.sendMessage({
        to: '+15551234567',
        body: 'Hi',
        idempotencyKey: 'mlf:k',
      })
    ).resolves.toMatchObject({ conflict: true, status: 'failed' });
  });

  it('lookup found:true uses toLast4 shape; 405→unknown', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          found: true,
          id: 'm9',
          toLast4: '4567',
          status: 'queued',
          error: null,
          created: '2026-10-28T00:00:00Z',
          updated: '2026-10-28T00:00:01Z',
          attempts: 0,
          auto: true,
        }),
      })
    );
    await expect(adapter.lookupByIdempotencyKey('mlf:k')).resolves.toEqual({
      outcome: 'sent',
      found: true,
      id: 'm9',
      status: 'queued',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 405,
        json: async () => ({ detail: 'Method Not Allowed' }),
      })
    );
    await expect(adapter.lookupByIdempotencyKey('mlf:k')).resolves.toEqual({
      outcome: 'unknown',
      found: false,
    });
  });

  it('warnIfRelayLookupUnsupported logs on missing capabilities', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Not Found' }),
      })
    );
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const support = await warnIfRelayLookupUnsupported(adapter);
    expect(support.supported).toBe(false);
    expect(String(err.mock.calls[0][0])).toMatch(/NOT CONFIRMED/);
    expect(String(err.mock.calls[0][0])).toContain(
      BRWN_RELAY_MIN_VERSION_FOR_REQUEUE
    );
  });

  it('keyed send without prior caps probe → no keyEchoed trust alone', async () => {
    const { isRelayKeySupportConfirmed } = await import('@/services/sms-sid');
    const adapter = setup();
    expect(isRelayKeySupportConfirmed()).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'abc',
            status: 'queued',
            idempotencyKey: 'mlf:k',
          }),
      })
    );
    const result = await adapter.sendMessage({
      to: '+15551234567',
      body: 'Hi',
      idempotencyKey: 'mlf:k',
    });
    // Echo alone is not enough — caps must have been probed first.
    expect(result.keyEchoed).toBe(true);
    expect(isRelayKeySupportConfirmed()).toBe(false);
  });
});
