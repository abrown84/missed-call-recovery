import { describe, expect, it } from 'vitest';
import {
  campaignStepMessageSid,
  classifyRelayLookupResponse,
  isConfirmedSmsStatus,
  parseMessageSid,
  recoveryMessageSid,
} from './sms-sid';

describe('sms-sid parse / confirm', () => {
  it('parses campaign and recovery sids', () => {
    const c = campaignStepMessageSid('E1', 'C1', 3);
    expect(parseMessageSid(c)).toEqual({
      kind: 'campaign',
      enrollmentId: 'E1',
      campaignId: 'C1',
      stepNumber: 3,
    });
    expect(parseMessageSid(`${c}:abandoned:99`)).toEqual({
      kind: 'campaign',
      enrollmentId: 'E1',
      campaignId: 'C1',
      stepNumber: 3,
    });
    expect(parseMessageSid(recoveryMessageSid('L9'))).toEqual({
      kind: 'recovery',
      leadId: 'L9',
    });
  });

  it('treats only confirmed statuses as advance-safe', () => {
    expect(isConfirmedSmsStatus('queued')).toBe(true);
    expect(isConfirmedSmsStatus('sent')).toBe(true);
    expect(isConfirmedSmsStatus('sending')).toBe(false);
    expect(isConfirmedSmsStatus('unknown')).toBe(false);
  });
});

describe('relay lookup contract (conservative)', () => {
  it('bare 404 is unknown — not never_sent', () => {
    expect(
      classifyRelayLookupResponse({ httpStatus: 404, body: null })
    ).toBe('unknown');
  });

  it('array response is unknown', () => {
    expect(
      classifyRelayLookupResponse({
        httpStatus: 200,
        body: [{ id: 'x' }],
      })
    ).toBe('unknown');
  });

  it('missing lookup body is unknown', () => {
    expect(
      classifyRelayLookupResponse({ httpStatus: 200, body: {} })
    ).toBe('unknown');
    expect(
      classifyRelayLookupResponse({ httpStatus: 200, body: null })
    ).toBe('unknown');
  });

  it('explicit found:false is never_sent', () => {
    expect(
      classifyRelayLookupResponse({
        httpStatus: 200,
        body: { found: false },
      })
    ).toBe('never_sent');
  });

  it('found:true with id is sent', () => {
    expect(
      classifyRelayLookupResponse({
        httpStatus: 200,
        body: { found: true, id: 'm1', status: 'queued' },
      })
    ).toBe('sent');
    expect(
      classifyRelayLookupResponse({
        httpStatus: 200,
        body: { id: 'm1' },
      })
    ).toBe('sent');
  });
});
