/**
 * Targeted behavioural killers for campaign-logic.ts Stryker survivors (QC r7).
 */
import { describe, expect, it } from 'vitest';
import {
  CLAIM_STALE_MS,
  LEAD_LOOKUP_MAX_AGE_DAYS,
  PARKED_SEND_MS,
  classifyMessageInsertError,
  decideReplyEnrollmentAction,
  getCampaignReplyMode,
  hasFreshClaim,
  isEnrollmentClaimable,
  isLeadWithinLookupAge,
  isProductionRuntime,
  parkedNextSendAt,
  planEnrollmentStart,
  selectCampaignForUrgency,
  shouldSendCampaignStep,
} from './campaign-logic';

describe('getCampaignReplyMode / selectCampaignForUrgency', () => {
  it('defaults to pause; only continue when explicitly set', () => {
    expect(getCampaignReplyMode({})).toBe('pause');
    expect(getCampaignReplyMode({ CAMPAIGN_REPLY_MODE: '' })).toBe('pause');
    expect(getCampaignReplyMode({ CAMPAIGN_REPLY_MODE: 'PAUSE' })).toBe('pause');
    expect(getCampaignReplyMode({ CAMPAIGN_REPLY_MODE: 'continue' })).toBe(
      'continue'
    );
  });

  it('exact urgency wins; null filter is catch-all; missing → undefined', () => {
    const camps = [
      { id: 'e', name: 'E', urgency_filter: 'emergency' },
      { id: 's', name: 'S', urgency_filter: null },
    ];
    expect(selectCampaignForUrgency(camps, 'emergency')?.id).toBe('e');
    expect(selectCampaignForUrgency(camps, 'high')?.id).toBe('s');
    expect(selectCampaignForUrgency(camps, null)?.id).toBe('s');
    expect(selectCampaignForUrgency([], 'emergency')).toBeUndefined();
  });
});

describe('planEnrollmentStart', () => {
  const steps = [
    { step_number: 2, delay_minutes: 30 },
    { step_number: 1, delay_minutes: 0 },
  ];

  it('sorts by step_number ascending (not reverse / broken compare)', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const p = planEnrollmentStart(steps, {
      recoveryAlreadySent: false,
      now,
    });
    expect(p.currentStep).toBe(1);
    expect(p.nextSendAt.toISOString()).toBe(now.toISOString());
  });

  it('skips delay-0 when recoveryAlreadySent + treatRecoveryAsInitial', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const p = planEnrollmentStart(steps, {
      recoveryAlreadySent: true,
      treatRecoveryAsInitial: true,
      now,
    });
    expect(p.currentStep).toBe(2);
    expect(p.skippedInitial).toBe(true);
    expect(p.nextSendAt.getTime()).toBe(now.getTime() + 30 * 60 * 1000);
  });

  it('does not skip when treatRecoveryAsInitial is false', () => {
    const p = planEnrollmentStart(steps, {
      recoveryAlreadySent: true,
      treatRecoveryAsInitial: false,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(p.currentStep).toBe(1);
    expect(p.skippedInitial).toBe(false);
  });

  it('does not skip when first step delay_minutes !== 0 even if recovery sent', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const delayed = [
      { step_number: 1, delay_minutes: 15 },
      { step_number: 2, delay_minutes: 60 },
    ];
    const p = planEnrollmentStart(delayed, {
      recoveryAlreadySent: true,
      treatRecoveryAsInitial: true,
      now,
    });
    expect(p.currentStep).toBe(1);
    expect(p.skippedInitial).toBe(false);
    expect(p.nextSendAt.getTime()).toBe(now.getTime() + 15 * 60 * 1000);
  });

  it('throws on empty steps', () => {
    expect(() =>
      planEnrollmentStart([], { recoveryAlreadySent: false })
    ).toThrow(/no steps/i);
  });
});

describe('parkedNextSendAt / shouldSendCampaignStep', () => {
  it('parks exactly PARKED_SEND_MS ahead (not behind)', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    expect(parkedNextSendAt(now)).toBe(
      new Date(now.getTime() + PARKED_SEND_MS).toISOString()
    );
  });

  it('blocks when sid already present (some not every)', () => {
    expect(
      shouldSendCampaignStep('E', 'C', 1, [null, 'mlf:campaign:E:C:step:1'])
    ).toBe(false);
    expect(shouldSendCampaignStep('E', 'C', 1, [null, 'other'])).toBe(true);
  });
});

describe('decideReplyEnrollmentAction / hasFreshClaim', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('noop without enrollment; pause active when no target + pause mode', () => {
    expect(
      decideReplyEnrollmentAction(null, undefined, { now })
    ).toEqual({ action: 'noop' });
    expect(
      decideReplyEnrollmentAction(
        { id: 'e', campaign_id: 'c', status: 'active' },
        undefined,
        { replyMode: 'pause', now }
      )
    ).toEqual({ action: 'pause' });
    expect(
      decideReplyEnrollmentAction(
        { id: 'e', campaign_id: 'c', status: 'active' },
        undefined,
        { replyMode: 'continue', now }
      )
    ).toEqual({ action: 'noop' });
  });

  it('switches when campaign differs and claim is stale', () => {
    expect(
      decideReplyEnrollmentAction(
        {
          id: 'e',
          campaign_id: 'old',
          status: 'active',
          claimed_at: '2000-01-01T00:00:00.000Z',
        },
        { id: 'new', name: 'N', urgency_filter: 'emergency' },
        { now }
      )
    ).toEqual({ action: 'switch', targetCampaignId: 'new' });
  });

  it('defers switch when claim is fresh', () => {
    const claimed = new Date(now.getTime() - 1000).toISOString();
    expect(
      decideReplyEnrollmentAction(
        {
          id: 'e',
          campaign_id: 'old',
          status: 'active',
          claimed_at: claimed,
        },
        { id: 'new', name: 'N', urgency_filter: 'emergency' },
        { now, claimStaleMs: CLAIM_STALE_MS }
      )
    ).toEqual({ action: 'defer_switch', targetCampaignId: 'new' });
  });

  it('pauses same campaign when active + pause mode', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e', campaign_id: 'c', status: 'active' },
        { id: 'c', name: 'S', urgency_filter: null },
        { replyMode: 'pause', now }
      )
    ).toEqual({ action: 'pause' });
  });

  it('same campaign + continue mode is noop (not forced pause)', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e', campaign_id: 'c', status: 'active' },
        { id: 'c', name: 'S', urgency_filter: null },
        { replyMode: 'continue', now }
      )
    ).toEqual({ action: 'noop' });
  });

  it('inactive same campaign is noop even in pause mode', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e', campaign_id: 'c', status: 'paused' },
        { id: 'c', name: 'S', urgency_filter: null },
        { replyMode: 'pause', now }
      )
    ).toEqual({ action: 'noop' });
  });

  it('defaults replyMode to pause when options omit replyMode', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e', campaign_id: 'c', status: 'active' },
        { id: 'c', name: 'S', urgency_filter: null },
        { now }
      )
    ).toEqual({ action: 'pause' });
  });

  it('defers switch using default CLAIM_STALE_MS when claimStaleMs omitted', () => {
    const claimed = new Date(now.getTime() - 1000).toISOString();
    expect(
      decideReplyEnrollmentAction(
        {
          id: 'e',
          campaign_id: 'old',
          status: 'active',
          claimed_at: claimed,
        },
        { id: 'new', name: 'N', urgency_filter: 'emergency' },
        { now }
      )
    ).toEqual({ action: 'defer_switch', targetCampaignId: 'new' });
  });

  it('hasFreshClaim uses strict < staleMs (not <=)', () => {
    const claimed = new Date(now.getTime() - CLAIM_STALE_MS).toISOString();
    expect(hasFreshClaim({ claimed_at: claimed }, now, CLAIM_STALE_MS)).toBe(
      false
    );
    expect(
      hasFreshClaim(
        { claimed_at: new Date(now.getTime() - CLAIM_STALE_MS + 1).toISOString() },
        now,
        CLAIM_STALE_MS
      )
    ).toBe(true);
    expect(hasFreshClaim({ claimed_at: null }, now)).toBe(false);
    expect(hasFreshClaim({ claimed_at: 'not-a-date' }, now)).toBe(false);
  });

  it('trim+lower on CAMPAIGN_REPLY_MODE (Continue / padded)', () => {
    expect(getCampaignReplyMode({ CAMPAIGN_REPLY_MODE: 'Continue' })).toBe(
      'continue'
    );
    expect(getCampaignReplyMode({ CAMPAIGN_REPLY_MODE: ' CONTINUE ' })).toBe(
      'continue'
    );
    expect(getCampaignReplyMode({ CAMPAIGN_REPLY_MODE: 'Pause' })).toBe('pause');
  });
});

describe('isLeadWithinLookupAge / isEnrollmentClaimable', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('age window is inclusive 0..max days', () => {
    expect(isLeadWithinLookupAge(now, now)).toBe(true);
    expect(
      isLeadWithinLookupAge(
        new Date(now.getTime() - LEAD_LOOKUP_MAX_AGE_DAYS * 86400000),
        now
      )
    ).toBe(true);
    expect(
      isLeadWithinLookupAge(
        new Date(now.getTime() - LEAD_LOOKUP_MAX_AGE_DAYS * 86400000 - 1),
        now
      )
    ).toBe(false);
    expect(isLeadWithinLookupAge('bogus', now)).toBe(false);
    expect(
      isLeadWithinLookupAge(new Date(now.getTime() + 1000), now)
    ).toBe(false);
  });

  it('claimable only when active, not fresh-claimed, and due', () => {
    expect(
      isEnrollmentClaimable(
        { status: 'paused', next_send_at: null, claimed_at: null },
        now
      )
    ).toBe(false);
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: null,
          claimed_at: new Date(now.getTime() - 1000).toISOString(),
        },
        now
      )
    ).toBe(false);
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: new Date(now.getTime() - 1000).toISOString(),
          claimed_at: null,
        },
        now
      )
    ).toBe(true);
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: new Date(now.getTime() + 60_000).toISOString(),
          claimed_at: null,
        },
        now
      )
    ).toBe(false);
  });

  it('fresh claim blocks reclaim even when next_send_at is due', () => {
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: new Date(now.getTime() - 1000).toISOString(),
          claimed_at: new Date(now.getTime() - 1000).toISOString(),
        },
        now
      )
    ).toBe(false);
  });

  it('paused stays unclaimable even when next_send_at is due', () => {
    expect(
      isEnrollmentClaimable(
        {
          status: 'paused',
          next_send_at: new Date(now.getTime() - 1000).toISOString(),
          claimed_at: null,
        },
        now
      )
    ).toBe(false);
  });

  it('null next_send_at + null claimed_at is not claimable', () => {
    expect(
      isEnrollmentClaimable(
        { status: 'active', next_send_at: null, claimed_at: null },
        now
      )
    ).toBe(false);
  });

  it('next_send_at exactly equal to now is due (<= not <)', () => {
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: now.toISOString(),
          claimed_at: null,
        },
        now
      )
    ).toBe(true);
  });

  it('exactly-stale claim with null next_send_at is reclaimable (>=)', () => {
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: null,
          claimed_at: new Date(now.getTime() - CLAIM_STALE_MS).toISOString(),
        },
        now
      )
    ).toBe(true);
  });

  it('exactly-stale claim with due next_send_at is claimable (not fresh)', () => {
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: new Date(now.getTime() - 1).toISOString(),
          claimed_at: new Date(now.getTime() - CLAIM_STALE_MS).toISOString(),
        },
        now
      )
    ).toBe(true);
  });

  it('accepts Date objects for createdAt (not only strings)', () => {
    const created = new Date(now.getTime() - 86400000);
    expect(isLeadWithinLookupAge(created, now)).toBe(true);
  });
});

describe('classifyMessageInsertError / isProductionRuntime', () => {
  it('maps null / 23505 / other', () => {
    expect(classifyMessageInsertError(null)).toBe('ok');
    expect(classifyMessageInsertError({ code: '23505' })).toBe('duplicate');
    expect(classifyMessageInsertError({ code: 'xx' })).toBe('failed');
  });

  it('production when VERCEL_ENV or NODE_ENV is production', () => {
    expect(isProductionRuntime({})).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true);
    expect(isProductionRuntime({ VERCEL_ENV: 'production' })).toBe(true);
    expect(isProductionRuntime({ NODE_ENV: 'test' })).toBe(false);
  });
});
