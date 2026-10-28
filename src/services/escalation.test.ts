import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  notifyPossibleOptOut,
  OWNER_NOTIFY_MAX_ATTEMPTS,
  shouldEscalate,
} from './escalation';
import type { Database } from '@/types/database';

vi.mock('@/services/send', () => ({
  sendMessage: vi.fn(),
}));

import { sendMessage } from '@/services/send';

type Business = Database['public']['Tables']['businesses']['Row'];

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Plumbing',
    phone: '+15550001111',
    vertical: 'plumbing',
    timezone: 'America/New_York',
    business_hours_start: '08:00',
    business_hours_end: '18:00',
    after_hours_enabled: false,
    emergency_phone: null,
    settings: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('notifyPossibleOptOut (QC r10 retry+ALERT)', () => {
  const send = vi.mocked(sendMessage);

  beforeEach(() => {
    send.mockReset();
  });

  it('returns true on first sent without retrying', async () => {
    send.mockResolvedValueOnce({
      kind: 'sent',
      sid: 's',
      messageId: 's',
      providerStatus: 'queued',
      keySupportedAtSend: true,
    });
    await expect(
      notifyPossibleOptOut('lead-1', makeBusiness(), 'maybe stop?', 'ambiguous')
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries up to OWNER_NOTIFY_MAX_ATTEMPTS then ALERT + false', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    send.mockResolvedValue({
      kind: 'blocked',
      reason: 'sends_disabled',
    } as never);

    await expect(
      notifyPossibleOptOut('lead-2', makeBusiness(), 'stop by?', 'ambiguous')
    ).resolves.toBe(false);

    expect(send).toHaveBeenCalledTimes(OWNER_NOTIFY_MAX_ATTEMPTS);
    expect(
      errSpy.mock.calls.some((c) =>
        String(c[0]).includes('ALERT: possible-opt-out owner notify exhausted')
      )
    ).toBe(true);
    errSpy.mockRestore();
  });

  it('succeeds on a later attempt within the cap', async () => {
    send
      .mockResolvedValueOnce({ kind: 'blocked', reason: 'sends_disabled' } as never)
      .mockResolvedValueOnce({
        kind: 'sent',
        sid: 's',
        messageId: 's',
        providerStatus: 'queued',
        keySupportedAtSend: true,
      });
    await expect(
      notifyPossibleOptOut('lead-3', makeBusiness(), 'can you stop?', 'ambiguous')
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('shouldEscalate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('always escalates emergencies', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T03:00:00')); // 3am local
    expect(shouldEscalate(makeBusiness(), 'emergency')).toBe(true);
  });

  it('escalates high urgency during business hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00'));
    expect(shouldEscalate(makeBusiness(), 'high')).toBe(true);
  });

  it('does not escalate high urgency after hours when after_hours disabled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T22:00:00'));
    expect(shouldEscalate(makeBusiness({ after_hours_enabled: false }), 'high')).toBe(
      false
    );
  });

  it('escalates high urgency after hours when after_hours enabled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T22:00:00'));
    expect(shouldEscalate(makeBusiness({ after_hours_enabled: true }), 'high')).toBe(
      true
    );
  });

  it('does not escalate normal or low', () => {
    expect(shouldEscalate(makeBusiness(), 'normal')).toBe(false);
    expect(shouldEscalate(makeBusiness(), 'low')).toBe(false);
  });
});
