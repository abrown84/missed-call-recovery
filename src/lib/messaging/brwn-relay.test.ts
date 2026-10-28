import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrwnRelayAdapter, resolveBrwnRelayUrl } from './brwn-relay';
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
    expect(resolveBrwnRelayUrl('http://localhost:8080')).toBe('http://localhost:8080');
    expect(() => resolveBrwnRelayUrl('http://relay.example.com')).toThrow(/https/);
  });

  it('rejects invalid URLs', () => {
    expect(() => resolveBrwnRelayUrl('not-a-url')).toThrow(/not a valid URL/);
    expect(() => resolveBrwnRelayUrl('ftp://x')).toThrow(/http: and https/);
    expect(() => resolveBrwnRelayUrl('')).toThrow(/not configured/);
  });
});

describe('BrwnRelayAdapter.sendMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.BRWN_RELAY_URL;
    delete process.env.BRWN_RELAY_SENDER_TOKEN;
    resetMessagingAdapterCache();
  });

  it('POSTs to /api/messages with bearer sender token', async () => {
    process.env.BRWN_RELAY_URL = 'https://relay.example.com';
    process.env.BRWN_RELAY_SENDER_TOKEN = 'sender-secret';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'abc123', status: 'queued' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new BrwnRelayAdapter();
    const result = await adapter.sendMessage({
      to: '+15551234567',
      body: 'Hi from recovery',
    });

    expect(result).toEqual({ id: 'abc123', status: 'queued' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://relay.example.com/api/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sender-secret');
    expect(JSON.parse(init.body)).toEqual({
      to: '+15551234567',
      body: 'Hi from recovery',
      auto: true,
    });
  });

  it('throws on rate limit and missing config', async () => {
    process.env.BRWN_RELAY_URL = 'https://relay.example.com';
    process.env.BRWN_RELAY_SENDER_TOKEN = 'sender-secret';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: 'recent_send' }),
      })
    );

    const adapter = new BrwnRelayAdapter();
    await expect(
      adapter.sendMessage({ to: '+1555', body: 'x' })
    ).rejects.toThrow(/rate-limited/);

    delete process.env.BRWN_RELAY_SENDER_TOKEN;
    await expect(
      adapter.sendMessage({ to: '+1555', body: 'x' })
    ).rejects.toThrow(/BRWN_RELAY_SENDER_TOKEN/);
  });

  it('includes idempotencyKey on send for relay dedupe contract', async () => {
    process.env.BRWN_RELAY_URL = 'https://relay.example.com';
    process.env.BRWN_RELAY_SENDER_TOKEN = 'sender-secret';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'm1', status: 'queued' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new BrwnRelayAdapter();
    await adapter.sendMessage({
      to: '+15551234567',
      body: 'Hi',
      idempotencyKey: 'campaign:E1:C1:step:2',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).idempotencyKey).toBe(
      'campaign:E1:C1:step:2'
    );
  });
});

describe('BrwnRelayAdapter.lookupByIdempotencyKey contract', () => {
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

  it('bare 404 → unknown (NOT never_sent)', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'not found' }),
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

  it('missing id / empty object → unknown', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
    );
    await expect(adapter.lookupByIdempotencyKey('k1')).resolves.toEqual({
      outcome: 'unknown',
      found: false,
    });
  });

  it('explicit { found: false } → never_sent (only safe requeue)', async () => {
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

  it('{ found: true, id } → sent', async () => {
    const adapter = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ found: true, id: 'm9', status: 'queued' }),
      })
    );
    await expect(adapter.lookupByIdempotencyKey('k1')).resolves.toEqual({
      outcome: 'sent',
      found: true,
      id: 'm9',
      status: 'queued',
    });
  });
});
