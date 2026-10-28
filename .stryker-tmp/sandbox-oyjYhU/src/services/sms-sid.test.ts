// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  campaignStepMessageSid,
  classifyRelayLookupResponse,
  isConfirmedSmsStatus,
  parseMessageSid,
  recoveryMessageSid,
} from './sms-sid';

describe('sms-sid parse / confirm', () => {
  it('parses mlf:-prefixed campaign and recovery sids', () => {
    const c = campaignStepMessageSid('E1', 'C1', 3);
    expect(c.startsWith('mlf:')).toBe(true);
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
    expect(isConfirmedSmsStatus('failed')).toBe(false);
    expect(isConfirmedSmsStatus('sending')).toBe(false);
  });
});

describe('relay lookup contract (FastAPI >= v1.7.6)', () => {
  it('405 / 404 → unknown', () => {
    expect(
      classifyRelayLookupResponse({
        httpStatus: 405,
        body: { detail: 'Method Not Allowed' },
      })
    ).toBe('unknown');
    expect(
      classifyRelayLookupResponse({ httpStatus: 404, body: null })
    ).toBe('unknown');
  });

  it('found:false → never_sent; found:true+failed → failed; toLast4 shape → sent', () => {
    expect(
      classifyRelayLookupResponse({
        httpStatus: 200,
        body: { found: false },
      })
    ).toBe('never_sent');
    expect(
      classifyRelayLookupResponse({
        httpStatus: 200,
        body: {
          found: true,
          id: 'm1',
          toLast4: '4567',
          status: 'queued',
          error: null,
          created: '2026-10-28T00:00:00Z',
          updated: '2026-10-28T00:00:01Z',
          attempts: 0,
          auto: true,
        },
      })
    ).toBe('sent');
    expect(
      classifyRelayLookupResponse({
        httpStatus: 200,
        body: { found: true, id: 'm1', toLast4: '4567', status: 'failed' },
      })
    ).toBe('failed');
  });

  it('id without found is unknown (no exists/present shortcuts)', () => {
    expect(
      classifyRelayLookupResponse({ httpStatus: 200, body: { id: 'm1' } })
    ).toBe('unknown');
  });
});
