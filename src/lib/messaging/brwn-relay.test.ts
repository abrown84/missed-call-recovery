import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BRWN_RELAY_MIN_VERSION_FOR_REQUEUE,
  BrwnRelayAdapter,
  resetRelayLookupWarningFlag,
  resolveBrwnRelayUrl,
  warnIfRelayLookupUnsupported,
} from './brwn-relay';
import { resetMessagingAdapterCache } from './index';

describe('resolveBrwnRelayUrl', () => {
  it('normalizes trailing slashes', () => {
    expect(resolveBrwnRelayUrl('https://relay.example.com/')).toBe(
      'https://relay.example.com'
    );
    expect(resolveBrwnRelayUrl('https://relay.example.com/sms/')).toBe(
      'https://relay.example.com/sms'
    );
  });

  it('allows http only for localhost', () => {
    expect(resolveBrwnRelayUrl('http://localhost:8080')).toBe(
      'http://localhost:8080'
    );
    expect(() => resolveBrwnRelayUrl('http://relay.example.com')).toThrow(
      /https/
    );
  });

  it('rejects invalid URLs', () => {
    expect(() => resolveBrwnRelayUrl('not-a-url')).toThrow(/not a valid URL/);
    expect(() => resolveBrwnRelayUrl('ftp://x')).toThrow(/http: and https/);
    expect(() => resolveBrwnRelayUrl('')).toThrow(/not configured/);
  });
});

describe('BrwnRelayAdapter.sendMessage — FastAPI contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.BRWN_RELAY_URL;
    delete process.env.BRWN_RELAY_SENDER_TOKEN;
    resetMessagingAdapterCache();
  });

  function setup() {
    process.env.BRWN_RELAY_URL = 'https://relay.example.com';
    process.env.BRWN_RELAY_SENDER_TOKEN = 'sender-secret';
    return new BrwnRelayAdapter();
  }

  it('POSTs JSON body fields exactly: to, body, auto (+ optional idempotencyKey)', async () => {
    const adapter = setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'abc123', status: 'queued' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.sendMessage({
      to: '+15551234567',
      body: 'Hi from recovery',
    });

    expect(result).toEqual({ id: 'abc123', status: 'queued' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://relay.example.com/api/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sender-secret');
    expect(init.headers['Content-Type']).toBe('application/json');
    // Exact field names — idempotencyKey is a JSON body field, not a header
    expect(JSON.parse(init.body)).toEqual({
      to: '+15551234567',
      body: 'Hi from recovery',
      auto: true,
    });
    expect(init.headers.idempotencyKey).toBeUndefined();
    expect(init.headers['Idempotency-Key']).toBeUndefined();
  });

  it('includes idempotencyKey in JSON body (not a header)', async () => {
    const adapter = setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'm1', status: 'queued' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await adapter.sendMessage({
      to: '+15551234567',
      body: 'Hi',
      idempotencyKey: 'campaign:E1:C1:step:2',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      to: '+15551234567',
      body: 'Hi',
      auto: true,
      idempotencyKey: 'campaign:E1:C1:step:2',
    });
  });

  it('200 { id, status, duplicate:true } is success (not an error)', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ id: 'm-dup', status: 'queued', duplicate: true }),
      })
    );
    await expect(
      adapter.sendMessage({
        to: '+15551234567',
        body: 'Hi',
        idempotencyKey: 'campaign:E1:C1:step:2',
      })
    ).resolves.toEqual({
      id: 'm-dup',
      status: 'queued',
      duplicate: true,
    });
  });

  it('429 { detail: recent_send } on keyed send → ambiguous (park), not throw', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ detail: 'recent_send' }),
      })
    );
    await expect(
      adapter.sendMessage({
        to: '+15551234567',
        body: 'Hi',
        idempotencyKey: 'campaign:E1:C1:step:2',
      })
    ).resolves.toEqual({
      id: 'rate-limited:campaign:E1:C1:step:2',
      status: 'unknown',
      ambiguous: true,
    });
  });

  it('429 without idempotencyKey still throws (unkeyed hard error)', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ detail: 'recent_send' }),
      })
    );
    await expect(
      adapter.sendMessage({ to: '+15551234567', body: 'x' })
    ).rejects.toThrow(/rate-limited/);
  });

  it('throws when sender token missing', async () => {
    process.env.BRWN_RELAY_URL = 'https://relay.example.com';
    delete process.env.BRWN_RELAY_SENDER_TOKEN;
    const adapter = new BrwnRelayAdapter();
    await expect(
      adapter.sendMessage({ to: '+1555', body: 'x' })
    ).rejects.toThrow(/BRWN_RELAY_SENDER_TOKEN/);
  });
});

describe('BrwnRelayAdapter.lookupByIdempotencyKey — FastAPI contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.BRWN_RELAY_URL;
    delete process.env.BRWN_RELAY_SENDER_TOKEN;
    resetMessagingAdapterCache();
    resetRelayLookupWarningFlag();
  });

  function setup() {
    process.env.BRWN_RELAY_URL = 'https://relay.example.com';
    process.env.BRWN_RELAY_SENDER_TOKEN = 'sender-secret';
    return new BrwnRelayAdapter();
  }

  it('GETs /api/messages?idempotencyKey=<key> with Bearer auth', async () => {
    const adapter = setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ found: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await adapter.lookupByIdempotencyKey('campaign:E1:C1:step:2');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://relay.example.com/api/messages?idempotencyKey=campaign%3AE1%3AC1%3Astep%3A2'
    );
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer sender-secret');
  });

  it('{ found: false } → never_sent', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ found: false }),
      })
    );
    await expect(adapter.lookupByIdempotencyKey('k1')).resolves.toEqual({
      outcome: 'never_sent',
      found: false,
    });
  });

  it('{ found: true, id, to, status, … } → sent', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          found: true,
          id: 'm9',
          to: '+15551234567',
          status: 'queued',
          error: null,
          created: '2026-10-28T00:00:00Z',
          updated: '2026-10-28T00:00:01Z',
          attempts: 0,
          auto: true,
        }),
      })
    );
    await expect(adapter.lookupByIdempotencyKey('k1')).resolves.toEqual({
      outcome: 'sent',
      found: true,
      id: 'm9',
      status: 'queued',
    });
  });

  it('405 Method Not Allowed → unknown (pre-v1.7.5 relay)', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 405,
        json: async () => ({ detail: 'Method Not Allowed' }),
      })
    );
    await expect(adapter.lookupByIdempotencyKey('k1')).resolves.toEqual({
      outcome: 'unknown',
      found: false,
    });
  });

  it('404 → unknown (NOT never_sent)', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Not Found' }),
      })
    );
    await expect(adapter.lookupByIdempotencyKey('k1')).resolves.toEqual({
      outcome: 'unknown',
      found: false,
    });
  });

  it('array body → unknown', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: 'x' }],
      })
    );
    await expect(adapter.lookupByIdempotencyKey('k1')).resolves.toEqual({
      outcome: 'unknown',
      found: false,
    });
  });
});

describe('relay lookup health check', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.BRWN_RELAY_URL;
    delete process.env.BRWN_RELAY_SENDER_TOKEN;
    resetRelayLookupWarningFlag();
  });

  it('checkLookupSupport reports unsupported on 405 with loud warn', async () => {
    process.env.BRWN_RELAY_URL = 'https://relay.example.com';
    process.env.BRWN_RELAY_SENDER_TOKEN = 'sender-secret';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 405,
        json: async () => ({ detail: 'Method Not Allowed' }),
      })
    );
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const adapter = new BrwnRelayAdapter();
    const support = await warnIfRelayLookupUnsupported(adapter);
    expect(support.supported).toBe(false);
    if (!support.supported) {
      expect(support.httpStatus).toBe(405);
      expect(support.reason).toContain(BRWN_RELAY_MIN_VERSION_FOR_REQUEUE);
    }
    expect(err).toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toMatch(/LOOKUP NOT SUPPORTED/);
    expect(String(err.mock.calls[0][0])).toMatch(/STAY PARKED/);
  });

  it('checkLookupSupport reports supported on { found: false }', async () => {
    process.env.BRWN_RELAY_URL = 'https://relay.example.com';
    process.env.BRWN_RELAY_SENDER_TOKEN = 'sender-secret';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ found: false }),
      })
    );
    const adapter = new BrwnRelayAdapter();
    await expect(adapter.checkLookupSupport()).resolves.toEqual({
      supported: true,
    });
  });
});
