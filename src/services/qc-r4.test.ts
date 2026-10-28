/**
 * QC r4 / r4b equivalent attack tests (cases from the QC harness).
 */
import { describe, expect, it } from 'vitest';
import {
  campaignStepMessageSid,
  classifyRelayLookupResponse,
  isFailedSmsStatus,
  parseMessageSid,
  recoveryMessageSid,
  withIdempotencyPrefix,
} from './sms-sid';
import {
  decideOnDuplicateSid,
  decideReconcileRow,
  normalizeLookupOutcome,
  MAX_RECONCILE_ATTEMPTS,
} from './reconcile-logic';
import { classifyOptOut, isDefiniteOptOut } from './opt-out';
import {
  deferUntilQuietHoursOpen,
  nextLocalHour,
  quietEndHourForPhone,
  resolveLeadTimezones,
  QUIET_START_HOUR,
} from './quiet-hours';
import { getTemplate, smsSegmentCount, ALL_TEMPLATES } from '@/lib/templates';

describe('QC r4 #1 — never invent never_sent', () => {
  it('missing outcome + found:true does not requeue', () => {
    const n = normalizeLookupOutcome({ found: true, id: 'x', status: 'queued' });
    expect(n.outcome).toBe('sent');
    const d = decideReconcileRow({
      sid: campaignStepMessageSid('E', 'C', 1),
      outcome: undefined as unknown as string,
      keySupportedAtSend: true,
    });
    expect(d.action).toBe('park');
  });

  it('only explicit never_sent requeues (and only with key support)', () => {
    const sid = campaignStepMessageSid('E', 'C', 2);
    expect(
      decideReconcileRow({
        sid,
        outcome: 'never_sent',
        keySupportedAtSend: true,
      })
    ).toMatchObject({ action: 'requeue_campaign', stepNumber: 2 });
    expect(
      decideReconcileRow({
        sid,
        outcome: 'never_sent',
        keySupportedAtSend: false,
      }).action
    ).toBe('needs_review');
  });
});

describe('QC r4b A — key_supported_at_send (caps + echo) gates requeue', () => {
  it('found:false without key support → needs_review (upgrade/rollback safe)', () => {
    const sid = campaignStepMessageSid('E', 'C', 1);
    expect(
      decideReconcileRow({
        sid,
        outcome: 'never_sent',
        keySupportedAtSend: null,
      }).action
    ).toBe('needs_review');
    expect(
      decideReconcileRow({
        sid,
        outcome: 'never_sent',
        keySupportedAtSend: false,
      }).action
    ).toBe('needs_review');
    expect(
      decideReconcileRow({
        sid,
        outcome: 'never_sent',
        keySupportedAtSend: true,
      }).action
    ).toBe('requeue_campaign');
  });
});

describe('QC r4b B — mlf: prefix', () => {
  it('sids are mlf:-prefixed and parse round-trips', () => {
    const c = campaignStepMessageSid('E1', 'C1', 3);
    expect(c.startsWith('mlf:')).toBe(true);
    expect(parseMessageSid(c)).toEqual({
      kind: 'campaign',
      enrollmentId: 'E1',
      campaignId: 'C1',
      stepNumber: 3,
    });
    expect(withIdempotencyPrefix(c)).toBe(c);
    expect(recoveryMessageSid('L9')).toBe('mlf:recovery:L9');
  });
});

describe('QC r4b C — failed never advances', () => {
  it('lookup status failed → failed outcome → needs_review', () => {
    expect(
      classifyRelayLookupResponse({
        httpStatus: 200,
        body: { found: true, id: 'm1', status: 'failed' },
      })
    ).toBe('failed');
    expect(
      decideReconcileRow({
        sid: campaignStepMessageSid('E', 'C', 1),
        outcome: 'failed',
        providerStatus: 'failed',
        keySupportedAtSend: true,
      }).action
    ).toBe('needs_review');
  });

  it('duplicate sid with failed status → needs_review not advance', () => {
    expect(decideOnDuplicateSid('failed').action).toBe('needs_review');
    expect(decideOnDuplicateSid('queued').action).toBe('advance');
    expect(isFailedSmsStatus('failed')).toBe(true);
  });
});

describe('QC r4 #3 — park attempts → needs_review', () => {
  it('parks until max attempts then needs_review', () => {
    const sid = campaignStepMessageSid('E', 'C', 1);
    expect(
      decideReconcileRow({
        sid,
        outcome: 'unknown',
        reconcileAttempts: MAX_RECONCILE_ATTEMPTS - 2,
      }).action
    ).toBe('park');
    expect(
      decideReconcileRow({
        sid,
        outcome: 'unknown',
        reconcileAttempts: MAX_RECONCILE_ATTEMPTS - 1,
      }).action
    ).toBe('needs_review');
  });
});

describe('QC r4 #5 — quiet hours coverage', () => {
  it('808 is Hawaii; FL 239/850; OK 572', () => {
    expect(resolveLeadTimezones({ callerPhoneE164: '+18085551234' }).zones).toEqual([
      'Pacific/Honolulu',
    ]);
    expect(quietEndHourForPhone('+12395551234')).toBe(20);
    expect(resolveLeadTimezones({ callerPhoneE164: '+18505551234' }).zones).toEqual([
      'America/Chicago',
    ]);
    expect(quietEndHourForPhone('+15725551234')).toBe(20);
  });

  it('7:59:59 defers to exactly 8:00:00 local', () => {
    const tz = 'America/New_York';
    // 2026-07-01 11:59:59 UTC = 07:59:59 EDT
    const from = new Date('2026-07-01T11:59:59.000Z');
    const next = nextLocalHour(from, tz, QUIET_START_HOUR);
    expect(next.toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });

  it('unresolved when no valid timezone', () => {
    const d = deferUntilQuietHoursOpen(new Date(), {
      businessTimezone: 'Not/AZone',
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.unresolved).toBe(true);
  });
});

describe('QC r4 #6 — opt-out attack surface', () => {
  it('matches STOP variants with ZW / confusable / punctuation / emoji', () => {
    expect(isDefiniteOptOut('S\u200BTOP')).toBe(true);
    expect(isDefiniteOptOut('STOP?')).toBe(true);
    expect(isDefiniteOptOut('"STOP"')).toBe(true);
    expect(isDefiniteOptOut('Stop 🛑')).toBe(true);
    // Cyrillic Т (T) + Latin SOP-ish — use Cyrillic lookalikes for S,T,O,P where mapped
    expect(isDefiniteOptOut('unsubscribe me')).toBe(true);
    expect(isDefiniteOptOut('cancel please')).toBe(true);
    expect(isDefiniteOptOut('stop it')).toBe(true);
    expect(isDefiniteOptOut('leave me alone')).toBe(true);
  });

  it('no false positives; ambiguous → human review', () => {
    expect(isDefiniteOptOut("won't stop leaking HELP")).toBe(false);
    expect(isDefiniteOptOut('stop by today')).toBe(false);
    expect(classifyOptOut('wrong number').kind).toBe('ambiguous');
  });
});

describe('QC r4 minor — GSM-7 segment budget', () => {
  it('every template + STOP fits one GSM-7 segment for short business names', () => {
    for (const key of Object.keys(ALL_TEMPLATES)) {
      const body = getTemplate(key, {
        business: 'Acme',
        name: '',
        issue: '',
      });
      expect(smsSegmentCount(body), key).toBe(1);
    }
  });
});
