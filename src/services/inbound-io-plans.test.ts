import { describe, expect, it } from 'vitest';
import {
  inboundAmbiguousReviewPayload,
  inboundQualifiedLeadPayload,
  inboundSmsReceivedPayload,
  stopLeadLookupResult,
} from './inbound-io-plans';

describe('inbound-io-plans', () => {
  it('inboundSmsReceivedPayload', () => {
    expect(
      inboundSmsReceivedPayload({
        leadId: 'L1',
        body: 'hi',
        messageSid: 'sid',
      })
    ).toEqual({
      lead_id: 'L1',
      direction: 'inbound',
      body: 'hi',
      message_sid: 'sid',
      status: 'received',
    });
  });

  it('inboundAmbiguousReviewPayload', () => {
    expect(
      inboundAmbiguousReviewPayload({
        reason: 'stop_word',
        flaggedAt: '2026-01-01T00:00:00.000Z',
      })
    ).toEqual({
      needs_human_review: true,
      needs_human_review_at: '2026-01-01T00:00:00.000Z',
      needs_human_review_reason: 'stop_word',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('inboundQualifiedLeadPayload', () => {
    expect(
      inboundQualifiedLeadPayload({
        urgency: 'high',
        issue: 'heat',
        body: 'no heat',
        classifiedAt: '2026-01-01T00:00:00.000Z',
      })
    ).toMatchObject({
      status: 'qualified',
      urgency: 'high',
      issue: 'heat',
      sms_response_text: 'no heat',
    });
  });

  it('stopLeadLookupResult short-circuits second query', () => {
    expect(stopLeadLookupResult({ id: 'x' }, true)).toEqual({ data: { id: 'x' } });
    expect(stopLeadLookupResult(null, false)).toBe(null);
  });
});
