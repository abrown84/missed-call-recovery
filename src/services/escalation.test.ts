import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  notifyPossibleOptOut,
  notifyUnresolvedTimezone,
  OWNER_NOTIFY_BACKOFF_MS,
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

describe('notifyPossibleOptOut (QC r10/r11 retry+backoff+ALERT)', () => {
  const send = vi.mocked(sendMessage);

  beforeEach(() => {
    send.mockReset();
  });

  it('returns true on first sent without retrying or sleeping', async () => {
    const sleep = vi.fn(async () => {});
    send.mockResolvedValueOnce({
      kind: 'sent',
      sid: 's',
      messageId: 's',
      providerStatus: 'queued',
      keySupportedAtSend: true,
    });
    await expect(
      notifyPossibleOptOut(
        'lead-1',
        makeBusiness(),
        'maybe stop?',
        'ambiguous',
        sleep
      )
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries with exponential backoff then ALERT + false', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const slept: number[] = [];
    const sleep = async (ms: number) => {
      slept.push(ms);
    };
    send.mockResolvedValue({
      kind: 'blocked',
      reason: 'sends_disabled',
    } as never);

    await expect(
      notifyPossibleOptOut(
        'lead-2',
        makeBusiness(),
        'stop by?',
        'ambiguous',
        sleep
      )
    ).resolves.toBe(false);

    expect(send).toHaveBeenCalledTimes(OWNER_NOTIFY_MAX_ATTEMPTS);
    expect(slept).toEqual([
      OWNER_NOTIFY_BACKOFF_MS[1],
      OWNER_NOTIFY_BACKOFF_MS[2],
    ]);
    expect(
      errSpy.mock.calls.some((c) =>
        String(c[0]).includes('ALERT: possible-opt-out owner notify exhausted')
      )
    ).toBe(true);
    errSpy.mockRestore();
  });

  it('succeeds on a later attempt within the cap', async () => {
    const sleep = vi.fn(async () => {});
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
      notifyPossibleOptOut(
        'lead-3',
        makeBusiness(),
        'can you stop?',
        'ambiguous',
        sleep
      )
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(OWNER_NOTIFY_BACKOFF_MS[1]);
  });
});

describe('notifyUnresolvedTimezone (QC r11)', () => {
  const send = vi.mocked(sendMessage);

  beforeEach(() => {
    send.mockReset();
  });

  it('alerts owner when area code has no zone map', async () => {
    const sleep = vi.fn(async () => {});
    send.mockResolvedValueOnce({
      kind: 'sent',
      sid: 's',
      messageId: 's',
      providerStatus: 'queued',
      keySupportedAtSend: true,
    });
    await expect(
      notifyUnresolvedTimezone(
        'lead-tz',
        makeBusiness(),
        '+19995551234',
        sleep
      )
    ).resolves.toBe(true);
    expect(send.mock.calls[0][0].body).toMatch(/UNKNOWN TIMEZONE/i);
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
