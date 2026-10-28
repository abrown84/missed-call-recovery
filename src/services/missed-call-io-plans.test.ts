import { describe, expect, it } from 'vitest';
import {
  missedCallLeadPayload,
  missedCallRowPayload,
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
});
