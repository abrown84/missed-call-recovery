// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { redactPhone } from '@/lib/pii';
import { bearerMatches } from '@/lib/messaging/auth';
import { BrwnRelayAdapter } from '@/lib/messaging/brwn-relay';
import { resolveBusinessPhone } from '@/services/inbound';
import { resetMessagingAdapterCache } from '@/lib/messaging';

/**
 * Missed-call → text-back flow pieces with the relay mocked.
 * No live network, no real SMS.
 */

describe('missed-call → text-back flow (mocked relay)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.BRWN_RELAY_URL;
    delete process.env.BRWN_RELAY_SENDER_TOKEN;
    delete process.env.BRWN_DEFAULT_BUSINESS_PHONE;
    resetMessagingAdapterCache();
  });

  it('queues recovery SMS through the BRWN relay after a missed-call path', async () => {
    process.env.BRWN_RELAY_URL = 'https://relay.example.com';
    process.env.BRWN_RELAY_SENDER_TOKEN = 'sender-token';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'msg-99', status: 'queued' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Simulate the text-back step that processMissedCall triggers after recording the lead
    const adapter = new BrwnRelayAdapter();
    const result = await adapter.sendMessage({
      to: '+15551234567',
      body: 'Hi, this is Acme Plumbing. We noticed we missed your call.',
      auto: true,
    });

    expect(result).toEqual({ id: 'msg-99', status: 'queued' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://relay.example.com/api/messages');
    expect(init.headers.Authorization).toBe('Bearer sender-token');
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe('+15551234567');
    expect(body.body).toContain('Acme Plumbing');
    expect(body.auto).toBe(true);
  });

  it('rejects webhook auth when bearer does not match', () => {
    expect(bearerMatches('Bearer wrong', 'expected-secret')).toBe(false);
    expect(bearerMatches('Bearer expected-secret', 'expected-secret')).toBe(true);
    expect(bearerMatches(undefined, 'expected-secret')).toBe(false);
  });

  it('redacts phones for logs (no full number leaked)', () => {
    const redacted = redactPhone('+15551234567');
    expect(redacted).toBe('***-***-4567');
    expect(redacted).not.toMatch(/555123/);
  });

  it('resolves business phone from payload or env fallback', () => {
    expect(resolveBusinessPhone('+15550001111')).toBe('+15550001111');
    expect(resolveBusinessPhone(null)).toBe(null);
    process.env.BRWN_DEFAULT_BUSINESS_PHONE = '+15550009999';
    expect(resolveBusinessPhone(undefined)).toBe('+15550009999');
  });
});
