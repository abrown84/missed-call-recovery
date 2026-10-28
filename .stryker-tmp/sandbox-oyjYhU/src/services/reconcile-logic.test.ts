// @ts-nocheck
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

  it('explicit found:false is never_sent; outcome string wins when present', () => {
    expect(normalizeLookupOutcome({ found: false })).toEqual({
      outcome: 'never_sent',
      providerStatus: 'queued',
    });
    expect(
      normalizeLookupOutcome({ outcome: 'never_sent', found: true }).outcome
    ).toBe('never_sent');
    expect(
      normalizeLookupOutcome({ outcome: 'sent', status: 'failed' })
    ).toEqual({ outcome: 'failed', providerStatus: 'failed' });
  });

  it('defaults missing status to queued; preserves explicit outcomes', () => {
    expect(normalizeLookupOutcome({ outcome: 'sent' })).toEqual({
      outcome: 'sent',
      providerStatus: 'queued',
    });
    expect(normalizeLookupOutcome({ outcome: 'unknown' })).toEqual({
      outcome: 'unknown',
      providerStatus: 'queued',
    });
    expect(normalizeLookupOutcome({ outcome: 'failed' })).toEqual({
      outcome: 'failed',
      providerStatus: 'queued',
    });
    expect(
      normalizeLookupOutcome({ outcome: 'never_sent', status: 'sent' })
    ).toEqual({ outcome: 'never_sent', providerStatus: 'sent' });
  });

  it('found:true without id/status stays unknown; status alone → sent', () => {
    // lookup.id || lookup.status — status-only must still confirm sent
    expect(normalizeLookupOutcome({ found: true, status: 'delivered' })).toEqual(
      {
        outcome: 'sent',
        providerStatus: 'delivered',
      }
    );
    expect(normalizeLookupOutcome({ found: true, id: 'sid-1' })).toEqual({
      outcome: 'sent',
      providerStatus: 'queued',
    });
    // found:true with neither id nor status → do not invent sent
    expect(normalizeLookupOutcome({ found: true })).toEqual({
      outcome: 'unknown',
      providerStatus: 'queued',
    });
  });

  it('found:true + failed status without outcome → failed', () => {
    expect(
      normalizeLookupOutcome({ found: true, status: 'failed' })
    ).toEqual({ outcome: 'failed', providerStatus: 'failed' });
  });

  it('explicit sent + non-failed status stays sent (&& failed would wrongly flip)', () => {
    expect(
      normalizeLookupOutcome({ outcome: 'sent', status: 'delivered' })
    ).toEqual({ outcome: 'sent', providerStatus: 'delivered' });
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

  it('confirm defaults missing providerStatus to queued', () => {
    const d = decideReconcileRow({
      sid,
      outcome: 'sent',
      keySupportedAtSend: true,
    });
    expect(d).toMatchObject({ action: 'confirm', providerStatus: 'queued' });
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
    const d = decideReconcileRow({
      sid,
      outcome: 'failed',
      keySupportedAtSend: true,
    });
    expect(d.action).toBe('needs_review');
    if (d.action === 'needs_review') {
      expect(d.reason).toBe('relay_status_failed');
    }
  });

  it('sent + failed provider status → needs_review', () => {
    const d = decideReconcileRow({
      sid,
      outcome: 'sent',
      providerStatus: 'failed',
      keySupportedAtSend: true,
    });
    expect(d).toMatchObject({
      action: 'needs_review',
      reason: 'relay_status_failed',
    });
  });

  it('never_sent without key support includes reason', () => {
    const d = decideReconcileRow({
      sid,
      outcome: 'never_sent',
      keySupportedAtSend: false,
    });
    expect(d).toMatchObject({
      action: 'needs_review',
      reason: 'never_sent_without_key_support',
    });
  });

  it('max attempts reason is max_attempts', () => {
    const d = decideReconcileRow({
      sid,
      outcome: 'unknown',
      reconcileAttempts: 4,
    });
    expect(d).toMatchObject({ action: 'needs_review', reason: 'max_attempts' });
  });

  it('never_sent with unknown sid parks (not recovery)', () => {
    expect(
      decideReconcileRow({
        sid: 'mlf:not-a-real-sid',
        outcome: 'never_sent',
        keySupportedAtSend: true,
      }).action
    ).toBe('park');
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
