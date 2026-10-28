import { describe, expect, it } from 'vitest';
import {
  inboundAmbiguousReviewPayload,
  inboundQualifiedLeadPayload,
  inboundSmsInsertInput,
  inboundSmsReceivedPayload,
  stopLeadLookupResult,
} from './inbound-io-plans';

describe('inbound-io-plans', () => {
  it('inboundSmsInsertInput is an identity carrier for insert fields', () => {
    expect(
      inboundSmsInsertInput({
        leadId: 'L1',
        body: 'hi',
        messageSid: 'sid',
      })
    ).toEqual({ leadId: 'L1', body: 'hi', messageSid: 'sid' });
  });

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

  it('inboundSmsReceivedPayload composed from insert input', () => {
    const input = inboundSmsInsertInput({
      leadId: 'L9',
      body: 'yo',
      messageSid: 'm9',
    });
    expect(inboundSmsReceivedPayload(input)).toEqual({
      lead_id: 'L9',
      direction: 'inbound',
      body: 'yo',
      message_sid: 'm9',
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

  it('inboundQualifiedLeadPayload preserves null issue (does not coerce)', () => {
    expect(
      inboundQualifiedLeadPayload({
        urgency: 'normal',
        issue: null,
        body: 'hi',
        classifiedAt: '2026-01-01T00:00:00.000Z',
      }).issue
    ).toBeNull();
  });

  it('skipSecondLookup treats null anyLead with matching phones as skip', () => {
    expect(stopLeadLookupResult(null, true)).toEqual({ data: null });
    expect(stopLeadLookupResult({ id: 'x' }, false)).toBeNull();
    expect(stopLeadLookupResult({ id: 'x' }, true)).toEqual({
      data: { id: 'x' },
    });
  });
});
