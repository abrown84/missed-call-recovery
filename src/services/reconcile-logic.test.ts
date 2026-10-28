import { describe, expect, it } from 'vitest';
import { campaignStepMessageSid, recoveryMessageSid } from './sms-sid';
import { decideOnDuplicateSid, decideReconcileRow } from './reconcile-logic';

describe('decideOnDuplicateSid', () => {
  it('advances only when existing row is confirmed sent', () => {
    expect(decideOnDuplicateSid('queued').action).toBe('advance');
    expect(decideOnDuplicateSid('delivered').action).toBe('advance');
    expect(decideOnDuplicateSid('sending').action).toBe('park');
    expect(decideOnDuplicateSid('unknown').action).toBe('park');
    expect(decideOnDuplicateSid(null).action).toBe('park');
  });
});

describe('decideReconcileRow state machine', () => {
  const sid = campaignStepMessageSid('E1', 'C-em', 2);

  it('confirms and keeps campaign parse on sent', () => {
    const d = decideReconcileRow({
      sid,
      outcome: 'sent',
      providerStatus: 'delivered',
    });
    expect(d).toEqual({
      action: 'confirm',
      providerStatus: 'delivered',
      parsed: {
        kind: 'campaign',
        enrollmentId: 'E1',
        campaignId: 'C-em',
        stepNumber: 2,
      },
    });
  });

  it('parks on unknown (bare 404 / missing lookup)', () => {
    expect(decideReconcileRow({ sid, outcome: 'unknown' }).action).toBe(
      'park'
    );
  });

  it('requeues the exact campaign step from the sid on never_sent', () => {
    expect(decideReconcileRow({ sid, outcome: 'never_sent' })).toEqual({
      action: 'requeue_campaign',
      enrollmentId: 'E1',
      campaignId: 'C-em',
      stepNumber: 2,
    });
  });

  it('handles recovery sids separately (no campaign step)', () => {
    const r = recoveryMessageSid('lead-9');
    expect(decideReconcileRow({ sid: r, outcome: 'never_sent' })).toEqual({
      action: 'requeue_recovery',
      leadId: 'lead-9',
    });
    expect(
      decideReconcileRow({ sid: r, outcome: 'sent', providerStatus: 'queued' })
        .action
    ).toBe('confirm');
  });
});
