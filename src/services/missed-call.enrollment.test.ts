import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const sendRecoverySMS = vi.fn();
const isPhoneSuppressed = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

vi.mock('@/services/sms', () => ({
  sendRecoverySMS: (...args: unknown[]) => sendRecoverySMS(...args),
}));

vi.mock('@/services/suppressions', () => ({
  isPhoneSuppressed: (...args: unknown[]) => isPhoneSuppressed(...args),
}));

import { processMissedCall } from './missed-call';

function thenable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, any> = {
    select: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

describe('processMissedCall (staging evidence b)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    sendRecoverySMS.mockReset();
    isPhoneSuppressed.mockReset();
    sendRecoverySMS.mockResolvedValue(undefined);
    isPhoneSuppressed.mockResolvedValue(false);
  });

  afterEach(() => vi.clearAllMocks());

  it('sends recovery SMS but does NOT enroll while urgency is unset', async () => {
    const business = {
      id: 'biz-1',
      phone: '+15559999999',
      name: 'Acme',
      vertical: 'plumbing',
      settings: {},
    };
    const missedCall = { id: 'mc-1', call_sid: 'call-1' };
    const lead = {
      id: 'lead-1',
      business_id: 'biz-1',
      missed_call_id: 'mc-1',
      caller_phone: '+15551234567',
      status: 'pending',
      urgency: null,
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'businesses') return thenable({ data: business, error: null });
      if (table === 'missed_calls') {
        const obj = thenable({ data: missedCall, error: null });
        obj.insert = vi.fn(() => obj);
        return obj;
      }
      if (table === 'leads') {
        const obj = thenable({ data: lead, error: null });
        obj.insert = vi.fn(() => obj);
        return obj;
      }
      return thenable({ data: null, error: null });
    });

    const result = await processMissedCall({
      callerPhone: '+15551234567',
      businessPhone: '+15559999999',
      callId: 'call-1',
      ringDurationSeconds: 10,
    });

    expect(result).toEqual({ missedCallId: 'mc-1', leadId: 'lead-1' });
    expect(sendRecoverySMS).toHaveBeenCalledOnce();
  });

  it('skips recovery SMS when phone is suppressed (prior STOP)', async () => {
    isPhoneSuppressed.mockResolvedValue(true);
    const business = {
      id: 'biz-1',
      phone: '+15559999999',
      name: 'Acme',
      vertical: 'plumbing',
      settings: {},
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'businesses') return thenable({ data: business, error: null });
      if (table === 'missed_calls') {
        const obj = thenable({ data: { id: 'mc-2' }, error: null });
        obj.insert = vi.fn(() => obj);
        return obj;
      }
      if (table === 'leads') {
        const obj = thenable({
          data: { id: 'lead-2', opted_out: true },
          error: null,
        });
        obj.insert = vi.fn(() => obj);
        return obj;
      }
      return thenable({ data: null, error: null });
    });

    await processMissedCall({
      callerPhone: '+15551234567',
      businessPhone: '+15559999999',
      callId: 'call-2',
    });

    expect(sendRecoverySMS).not.toHaveBeenCalled();
  });
});
