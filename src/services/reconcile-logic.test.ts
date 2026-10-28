import { describe, expect, it } from 'vitest';
import { campaignStepMessageSid, recoveryMessageSid } from './sms-sid';
import {
  decideOnDuplicateSid,
  decideReconcileRow,
  normalizeLookupOutcome,
} from './reconcile-logic';

describe('decideOnDuplicateSid', () => {
  it('advances only on confirmed; failed → needs_review', () => {
    expect(decideOnDuplicateSid('queued').action).toBe('advance');
    expect(decideOnDuplicateSid('failed').action).toBe('needs_review');
    expect(decideOnDuplicateSid('sending').action).toBe('park');
  });
});

describe('normalizeLookupOutcome', () => {
  it('never treats missing outcome as never_sent when found:true', () => {
    expect(
      normalizeLookupOutcome({ found: true, id: 'x', status: 'queued' }).outcome
    ).toBe('sent');
    expect(normalizeLookupOutcome({}).outcome).toBe('unknown');
  });

  it('maps failed status to failed', () => {
    expect(
      normalizeLookupOutcome({
        found: true,
        id: 'x',
        status: 'failed',
      }).outcome
    ).toBe('failed');
  });
});

describe('decideReconcileRow', () => {
  const sid = campaignStepMessageSid('E1', 'C-em', 2);

  it('confirms sent', () => {
    expect(
      decideReconcileRow({
        sid,
        outcome: 'sent',
        providerStatus: 'delivered',
        keySupportedAtSend: true,
      })
    ).toMatchObject({ action: 'confirm', providerStatus: 'delivered' });
  });

  it('parks unknown; requeues never_sent only with key support', () => {
    expect(decideReconcileRow({ sid, outcome: 'unknown' }).action).toBe(
      'park'
    );
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

  it('failed → needs_review', () => {
    expect(
      decideReconcileRow({
        sid,
        outcome: 'failed',
        keySupportedAtSend: true,
      }).action
    ).toBe('needs_review');
  });

  it('recovery never_sent with key support → requeue_recovery', () => {
    expect(
      decideReconcileRow({
        sid: recoveryMessageSid('lead-9'),
        outcome: 'never_sent',
        keySupportedAtSend: true,
      })
    ).toEqual({ action: 'requeue_recovery', leadId: 'lead-9' });
  });
});
