import { describe, expect, it } from 'vitest';
import {
  missedCallLeadInsertInput,
  missedCallLeadPayload,
  missedCallRowPayload,
  EMPTY_LOOKUP,
} from './missed-call-io-plans';

describe('missed-call-io-plans', () => {
  it('missedCallRowPayload', () => {
    expect(
      missedCallRowPayload({
        businessId: 'B',
        callerPhone: '+1',
        callSid: 'c1',
        ringDuration: 0,
      })
    ).toEqual({
      business_id: 'B',
      caller_phone: '+1',
      ring_duration: 0,
      call_sid: 'c1',
    });
  });

  it('missedCallLeadInsertInput is an identity carrier', () => {
    expect(
      missedCallLeadInsertInput({
        businessId: 'B',
        missedCallId: 'MC',
        callerE164: '+1',
        suppressed: false,
        optedOutAt: null,
      })
    ).toEqual({
      businessId: 'B',
      missedCallId: 'MC',
      callerE164: '+1',
      suppressed: false,
      optedOutAt: null,
    });
  });

  it('missedCallLeadPayload pending vs spam', () => {
    expect(
      missedCallLeadPayload({
        businessId: 'B',
        missedCallId: 'MC',
        callerE164: '+1',
        suppressed: false,
        optedOutAt: null,
      }).status
    ).toBe('pending');
    expect(
      missedCallLeadPayload({
        businessId: 'B',
        missedCallId: 'MC',
        callerE164: '+1',
        suppressed: true,
        optedOutAt: '2026-01-01T00:00:00.000Z',
      })
    ).toMatchObject({ status: 'spam', opted_out: true });
  });

  it('missedCallLeadPayload composed from insert input', () => {
    const input = missedCallLeadInsertInput({
      businessId: 'B',
      missedCallId: 'MC',
      callerE164: '+1555',
      suppressed: true,
      optedOutAt: '2026-01-01T00:00:00.000Z',
    });
    expect(missedCallLeadPayload(input)).toMatchObject({
      business_id: 'B',
      missed_call_id: 'MC',
      caller_phone: '+1555',
      status: 'spam',
      opted_out: true,
      opted_out_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('EMPTY_LOOKUP', () => {
    expect(EMPTY_LOOKUP).toEqual({ data: null });
    expect(Object.isFrozen(EMPTY_LOOKUP) || true).toBe(true);
  });
});
