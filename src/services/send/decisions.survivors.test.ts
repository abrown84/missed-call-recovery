import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  decideCustomerFacingGates,
  decideDuplicateSid,
  interpretCampaignSendOutcome,
  interpretRecoverySendOutcome,
  mapRelaySendResult,
  resolveIdempotencySid,
  classifyStatusRow,
} from './decisions';

describe('decisions survivors', () => {
  it('recovery gate only when campaign step 1 without skip', () => {
    // stepNumber !== 1 → no recovery gate
    expect(
      decideCustomerFacingGates({
        kind: 'campaign',
        stepNumber: 2,
        suppressed: false,
        optedOut: false,
        recovery: 'pending',
      })
    ).toBeNull();
    // kind recovery → no campaign recovery gate
    expect(
      decideCustomerFacingGates({
        kind: 'recovery',
        stepNumber: 1,
        suppressed: false,
        optedOut: false,
        recovery: 'pending',
      })
    ).toBeNull();
    // absent recovery → fall through
    expect(
      decideCustomerFacingGates({
        kind: 'campaign',
        stepNumber: 1,
        suppressed: false,
        optedOut: false,
        recovery: 'absent',
      })
    ).toBeNull();
    expect(
      decideCustomerFacingGates({
        kind: 'campaign',
        stepNumber: 1,
        suppressed: false,
        optedOut: false,
        recovery: 'resolved_abandoned',
      })
    ).toBeNull();
  });

  it('quiet object without nextSendAt/unresolved falls through', () => {
    expect(
      decideCustomerFacingGates({
        kind: 'recovery',
        suppressed: false,
        optedOut: false,
        quiet: { allowed: false } as never,
      })
    ).toBeNull();
    expect(
      decideCustomerFacingGates({
        kind: 'recovery',
        suppressed: false,
        optedOut: false,
        quiet: {
          allowed: false,
          unresolved: false,
          nextSendAt: undefined,
          zones: [],
          endHour: 21,
        } as never,
      })
    ).toBeNull();
  });

  it('resolveIdempotencySid campaign requires all fields', () => {
    expect(
      resolveIdempotencySid(
        { kind: 'campaign', leadId: 'L', enrollmentId: 'E' },
        9
      )
    ).toBe('mlf:campaign:L:9');
    expect(
      resolveIdempotencySid(
        { kind: 'campaign', leadId: 'L', campaignId: 'C', stepNumber: 1 },
        9
      )
    ).toBe('mlf:campaign:L:9');
    expect(
      resolveIdempotencySid(
        {
          kind: 'campaign',
          leadId: 'L',
          enrollmentId: 'E',
          campaignId: 'C',
          stepNumber: 0 as never,
        },
        9
      )
    ).toBe('mlf:campaign:L:9'); // step 0 falsy → fallback
    // Full campaign fields → stable step sid (not mlf:clock fallback)
    const full = resolveIdempotencySid(
      {
        kind: 'campaign',
        leadId: 'L',
        enrollmentId: 'E',
        campaignId: 'C',
        stepNumber: 2,
      },
      9
    );
    expect(full).toContain('E');
    expect(full).toContain('C');
    expect(full).not.toBe('mlf:campaign:L:9');
  });

  it('decideDuplicateSid exact reason / detail strings', () => {
    expect(decideDuplicateSid('NEEDS_REVIEW')).toEqual({
      action: 'needs_review',
      reason: 'duplicate_failed',
    });
    expect(decideDuplicateSid('needs_review')).toEqual({
      action: 'needs_review',
      reason: 'duplicate_failed',
    });
    expect(decideDuplicateSid('Abandoned_Retry')).toEqual({
      action: 'claim_deferred',
    });
    expect(decideDuplicateSid('deferred')).toEqual({
      action: 'claim_deferred',
    });
    expect(decideDuplicateSid('abandoned_retry')).toEqual({
      action: 'claim_deferred',
    });
    expect(decideDuplicateSid(null)).toEqual({
      action: 'block_in_flight',
      detail: 'missing',
    });
    expect(decideDuplicateSid('sending')).toEqual({
      action: 'block_in_flight',
      detail: 'sending',
    });
    // Filler status must NOT claim_deferred / needs_review
    expect(decideDuplicateSid('Stryker was here!')).toEqual({
      action: 'block_in_flight',
      detail: 'Stryker was here!',
    });
  });

  it('mapRelaySendResult defaults status to queued', () => {
    expect(mapRelaySendResult({ id: 'm' })).toEqual({
      type: 'ok',
      messageId: 'm',
      status: 'queued',
      keyEchoed: false,
      duplicate: undefined,
    });
    expect(
      mapRelaySendResult({ id: 'm', duplicate: true, status: 'sent' })
    ).toMatchObject({ duplicate: true, status: 'sent' });
  });

  it('classifyStatusRow delegates', () => {
    expect(classifyStatusRow('delivered')).toBe('resolved_sent');
    expect(classifyStatusRow(null)).toBe('absent');
    expect(classifyStatusRow('weird')).toBe('pending');
  });

  it('interpretCampaignSendOutcome release ok flag + park fallback', () => {
    const park = 'p';
    expect(
      interpretCampaignSendOutcome(
        { kind: 'ambiguous', sid: 's', reason: 'r' },
        park
      )
    ).toEqual({ type: 'park', nextSendAt: park });
    expect(
      interpretCampaignSendOutcome({ kind: 'never_sent', sid: 's' }, park)
    ).toEqual({ type: 'park' });
    // skipped with wrong reason must NOT advance (kills && → || / cond→true)
    expect(
      interpretCampaignSendOutcome(
        { kind: 'skipped', reason: 'something_else' },
        park
      )
    ).toEqual({ type: 'park' });
    // quiet_hours_deferred without nextSendAt must NOT release
    expect(
      interpretCampaignSendOutcome(
        { kind: 'blocked', reason: 'quiet_hours_deferred' },
        park
      )
    ).toEqual({ type: 'noop_false' });
    expect(
      interpretCampaignSendOutcome(
        {
          kind: 'blocked',
          reason: 'quiet_hours_deferred',
          nextSendAt: 't',
        },
        park
      )
    ).toEqual({ type: 'release', nextSendAt: 't', ok: true });
  });

  it('interpretRecoverySendOutcome unexpected / skipped reason', () => {
    expect(
      interpretRecoverySendOutcome({ kind: 'never_sent', sid: 's' }, 'f')
    ).toEqual({ type: 'log_blocked', reason: 'unexpected' });
    expect(
      interpretRecoverySendOutcome(
        { kind: 'blocked', reason: 'invalid_phone' },
        'f'
      )
    ).toEqual({ type: 'log_blocked', reason: 'invalid_phone' });
    // skipped body must run (not emptied) and use reason
    expect(
      interpretRecoverySendOutcome({ kind: 'skipped', reason: 'gate' }, 'f')
    ).toEqual({ type: 'log_blocked', reason: 'gate' });
    // quiet_hours_deferred requires both kind+reason (not cond→true)
    expect(
      interpretRecoverySendOutcome(
        { kind: 'blocked', reason: 'suppressed' },
        'f'
      )
    ).toEqual({ type: 'log_blocked', reason: 'suppressed' });
    expect(
      interpretRecoverySendOutcome(
        {
          kind: 'blocked',
          reason: 'quiet_hours_deferred',
          nextSendAt: 't',
        },
        'f'
      )
    ).toEqual({ type: 'persist_deferred', nextSendAt: 't' });
    // missing nextSendAt uses fallback
    expect(
      interpretRecoverySendOutcome(
        { kind: 'blocked', reason: 'quiet_hours_deferred' },
        'fallback'
      )
    ).toEqual({ type: 'persist_deferred', nextSendAt: 'fallback' });
  });

  it('property: duplicate status vocabulary exhausts actions', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: undefined }), (status) => {
        const d = decideDuplicateSid(status);
        expect(['confirm_existing', 'needs_review', 'claim_deferred', 'block_in_flight']).toContain(
          d.action
        );
      }),
      { numRuns: 50 }
    );
  });
});
