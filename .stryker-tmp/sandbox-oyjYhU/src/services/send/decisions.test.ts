// @ts-nocheck
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  decideCustomerFacingGates,
  decideDuplicateSid,
  interpretCampaignSendOutcome,
  interpretRecoverySendOutcome,
  mapRelaySendResult,
  resolveIdempotencySid,
} from './decisions';
import type { SendOutcome } from './types';

describe('decideCustomerFacingGates', () => {
  it('null for escalation/manual', () => {
    expect(
      decideCustomerFacingGates({
        kind: 'escalation',
        suppressed: true,
        optedOut: true,
      })
    ).toBeNull();
    expect(
      decideCustomerFacingGates({
        kind: 'manual',
        suppressed: true,
        optedOut: true,
      })
    ).toBeNull();
  });

  it('skipQuietHours ignores quiet block', () => {
    expect(
      decideCustomerFacingGates({
        kind: 'recovery',
        suppressed: false,
        optedOut: false,
        skipQuietHours: true,
        quiet: {
          allowed: false,
          unresolved: true,
          reason: 'x',
          zones: [],
        },
      })
    ).toBeNull();
  });

  it('property: suppressed beats opted_out beats recovery gate', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (suppressed, optedOut) => {
        const d = decideCustomerFacingGates({
          kind: 'campaign',
          stepNumber: 1,
          suppressed,
          optedOut,
          recovery: 'pending',
        });
        if (suppressed) expect(d).toEqual({ kind: 'blocked', reason: 'suppressed' });
        else if (optedOut) expect(d).toEqual({ kind: 'blocked', reason: 'opted_out' });
        else expect(d).toEqual({ kind: 'blocked', reason: 'recovery_pending' });
      }),
      { numRuns: 20 }
    );
  });

  it('suppressed / opted_out', () => {
    expect(
      decideCustomerFacingGates({
        kind: 'recovery',
        suppressed: true,
        optedOut: false,
      })
    ).toEqual({ kind: 'blocked', reason: 'suppressed' });
    expect(
      decideCustomerFacingGates({
        kind: 'campaign',
        suppressed: false,
        optedOut: true,
      })
    ).toEqual({ kind: 'blocked', reason: 'opted_out' });
  });

  it('recovery gate on campaign step 1', () => {
    expect(
      decideCustomerFacingGates({
        kind: 'campaign',
        stepNumber: 1,
        suppressed: false,
        optedOut: false,
        recovery: 'pending',
      })
    ).toEqual({ kind: 'blocked', reason: 'recovery_pending' });
    expect(
      decideCustomerFacingGates({
        kind: 'campaign',
        stepNumber: 1,
        suppressed: false,
        optedOut: false,
        recovery: 'resolved_sent',
      })
    ).toMatchObject({ kind: 'skipped' });
    expect(
      decideCustomerFacingGates({
        kind: 'campaign',
        stepNumber: 1,
        skipRecoveryGate: true,
        suppressed: false,
        optedOut: false,
        recovery: 'pending',
      })
    ).toBeNull();
  });

  it('quiet hours deferred / unresolved', () => {
    const next = new Date('2026-10-29T12:00:00.000Z');
    expect(
      decideCustomerFacingGates({
        kind: 'recovery',
        suppressed: false,
        optedOut: false,
        quiet: {
          allowed: false,
          nextSendAt: next,
          zones: ['America/New_York'],
          endHour: 21,
        },
      })
    ).toEqual({
      kind: 'blocked',
      reason: 'quiet_hours_deferred',
      nextSendAt: next.toISOString(),
    });
    expect(
      decideCustomerFacingGates({
        kind: 'recovery',
        suppressed: false,
        optedOut: false,
        quiet: {
          allowed: false,
          unresolved: true,
          reason: 'unmapped',
          zones: [],
        },
      })
    ).toMatchObject({ kind: 'blocked', reason: 'quiet_hours_unresolved' });
  });
});

describe('decideDuplicateSid', () => {
  it('property: confirmed → confirm; failed/needs_review → review; deferred → claim', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'queued',
          'sent',
          'delivered',
          'FAILED',
          'undelivered',
          'needs_review',
          'deferred',
          'abandoned_retry',
          'sending',
          null
        ),
        (status) => {
          const d = decideDuplicateSid(status);
          if (status && ['queued', 'sent', 'delivered'].includes(String(status).toLowerCase())) {
            expect(d.action).toBe('confirm_existing');
          } else if (
            status &&
            ['failed', 'undelivered', 'needs_review'].includes(
              String(status).toLowerCase()
            )
          ) {
            expect(d.action).toBe('needs_review');
          } else if (
            status &&
            ['deferred', 'abandoned_retry'].includes(String(status).toLowerCase())
          ) {
            expect(d.action).toBe('claim_deferred');
          } else {
            expect(d.action).toBe('block_in_flight');
          }
        }
      ),
      { numRuns: 40 }
    );
  });
});

describe('mapRelaySendResult', () => {
  it('maps conflict / maintenance / failed / ok', () => {
    expect(mapRelaySendResult({ id: '1', conflict: true }).type).toBe('conflict');
    expect(
      mapRelaySendResult({ id: '1', ambiguous: true, status: 'maintenance' }).type
    ).toBe('maintenance');
    expect(mapRelaySendResult({ id: '1', ambiguous: true }).type).toBe('rate_limit');
    expect(mapRelaySendResult({ id: '1', status: 'failed' }).type).toBe('failed');
    expect(
      mapRelaySendResult({ id: 'm', status: 'queued', keyEchoed: true })
    ).toMatchObject({ type: 'ok', keyEchoed: true });
  });
});

describe('resolveIdempotencySid', () => {
  it('prefers explicit key; recovery; campaign; fallback', () => {
    expect(
      resolveIdempotencySid(
        { idempotencyKey: 'x', kind: 'recovery', leadId: 'L' },
        1
      )
    ).toBe('x');
    expect(
      resolveIdempotencySid({ kind: 'recovery', leadId: 'L1' }, 1)
    ).toBe('mlf:recovery:L1');
    expect(
      resolveIdempotencySid(
        {
          kind: 'campaign',
          leadId: 'L',
          enrollmentId: 'E',
          campaignId: 'C',
          stepNumber: 2,
        },
        1
      )
    ).toBe('mlf:campaign:E:C:step:2');
    expect(
      resolveIdempotencySid({ kind: 'manual', leadId: 'L' }, 42)
    ).toBe('mlf:manual:L:42');
  });
});

describe('interpretCampaignSendOutcome', () => {
  const park = '2099-01-01T00:00:00.000Z';
  it('covers every outcome kind', () => {
    const cases: Array<[SendOutcome, string]> = [
      [
        { kind: 'skipped', reason: 'recovery_already_sent_skip_step_1' },
        'advance',
      ],
      [
        {
          kind: 'blocked',
          reason: 'quiet_hours_deferred',
          nextSendAt: '2026-01-01T00:00:00.000Z',
        },
        'release',
      ],
      [{ kind: 'blocked', reason: 'quiet_hours_unresolved' }, 'flag_unresolved_tz'],
      [{ kind: 'blocked', reason: 'recovery_pending' }, 'park'],
      [{ kind: 'blocked', reason: 'suppressed' }, 'pause_opt_out'],
      [{ kind: 'blocked', reason: 'opted_out' }, 'pause_opt_out'],
      [{ kind: 'blocked', reason: 'sends_disabled' }, 'release'],
      [{ kind: 'blocked', reason: 'duplicate_in_flight' }, 'park'],
      [{ kind: 'blocked', reason: 'invalid_phone' }, 'noop_false'],
      [
        {
          kind: 'sent',
          sid: 's',
          messageId: 'm',
          providerStatus: 'queued',
          keySupportedAtSend: true,
        },
        'advance',
      ],
      [{ kind: 'needs_review', sid: 's', reason: 'x' }, 'needs_review_terminal'],
      [
        { kind: 'ambiguous', sid: 's', reason: 'recent_send', nextRetryAt: park },
        'park',
      ],
      [{ kind: 'never_sent', sid: 's' }, 'park'],
    ];
    for (const [outcome, type] of cases) {
      expect(interpretCampaignSendOutcome(outcome, park).type).toBe(type);
    }
    // sends_disabled releases claim but counts as failure for cron
    expect(
      interpretCampaignSendOutcome(
        { kind: 'blocked', reason: 'sends_disabled' },
        park
      )
    ).toEqual({ type: 'release', nextSendAt: park, ok: false });
    expect(
      interpretCampaignSendOutcome(
        {
          kind: 'blocked',
          reason: 'quiet_hours_deferred',
          nextSendAt: '2026-01-01T00:00:00.000Z',
        },
        park
      )
    ).toEqual({
      type: 'release',
      nextSendAt: '2026-01-01T00:00:00.000Z',
      ok: true,
    });
  });
});

describe('interpretRecoverySendOutcome', () => {
  it('defers / logs / sent', () => {
    expect(
      interpretRecoverySendOutcome(
        {
          kind: 'blocked',
          reason: 'quiet_hours_deferred',
          nextSendAt: 't',
        },
        'fallback'
      )
    ).toEqual({ type: 'persist_deferred', nextSendAt: 't' });
    expect(
      interpretRecoverySendOutcome(
        { kind: 'blocked', reason: 'quiet_hours_deferred' },
        'fallback'
      )
    ).toEqual({ type: 'persist_deferred', nextSendAt: 'fallback' });
    expect(
      interpretRecoverySendOutcome({ kind: 'skipped', reason: 'x' }, 'f').type
    ).toBe('log_blocked');
    expect(
      interpretRecoverySendOutcome(
        { kind: 'needs_review', sid: 's', reason: 'r' },
        'f'
      )
    ).toEqual({ type: 'log_needs_review', sid: 's' });
    expect(
      interpretRecoverySendOutcome(
        { kind: 'ambiguous', sid: 's', reason: 'r' },
        'f'
      ).type
    ).toBe('log_ambiguous');
    expect(
      interpretRecoverySendOutcome(
        {
          kind: 'sent',
          sid: 's',
          messageId: 'm',
          providerStatus: 'queued',
          keySupportedAtSend: true,
        },
        'f'
      )
    ).toEqual({ type: 'log_sent', sid: 's' });
  });
});
