import { describe, expect, it } from 'vitest';
import {
  CLAIM_STALE_MS,
  campaignStepMessageSid,
  classifyMessageInsertError,
  decideReplyEnrollmentAction,
  getCampaignReplyMode,
  hasFreshClaim,
  isEnrollmentClaimable,
  isLeadWithinLookupAge,
  isProductionRuntime,
  planEnrollmentStart,
  parkedNextSendAt,
  selectCampaignForUrgency,
  shouldSendCampaignStep,
} from './campaign-logic';

const CAMPAIGNS = [
  { id: 'c-em', name: 'Emergency Follow-up', urgency_filter: 'emergency' },
  { id: 'c-hi', name: 'High Priority Follow-up', urgency_filter: 'high' },
  { id: 'c-std', name: 'Standard Follow-up', urgency_filter: null },
];

const STANDARD_STEPS = [
  { step_number: 1, delay_minutes: 0, template_key: 'standard_initial' },
  { step_number: 2, delay_minutes: 240, template_key: 'standard_followup_1' },
];

describe('campaignStepMessageSid includes campaign', () => {
  it('differs across campaigns for the same enrollment step', () => {
    const std = campaignStepMessageSid('enr-1', 'c-std', 2);
    const em = campaignStepMessageSid('enr-1', 'c-em', 2);
    expect(std).toBe('mlf:campaign:enr-1:c-std:step:2');
    expect(em).toBe('mlf:campaign:enr-1:c-em:step:2');
    expect(std).not.toBe(em);
  });

  it('shouldSendCampaignStep does not treat other-campaign sids as dupes', () => {
    const stdSid = campaignStepMessageSid('enr-1', 'c-std', 2);
    expect(
      shouldSendCampaignStep('enr-1', 'c-em', 2, [stdSid])
    ).toBe(true);
    expect(
      shouldSendCampaignStep('enr-1', 'c-std', 2, [stdSid])
    ).toBe(false);
  });
});

describe('decideReplyEnrollmentAction', () => {
  it('returns noop when enrollment missing', () => {
    expect(decideReplyEnrollmentAction(null, CAMPAIGNS[0])).toEqual({
      action: 'noop',
    });
  });

  it('pauses active enrollment when target campaign missing and replyMode pause', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e1', campaign_id: 'c-std', status: 'active' },
        undefined,
        { replyMode: 'pause' }
      )
    ).toEqual({ action: 'pause' });
  });

  it('noops when target campaign missing and replyMode continue', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e1', campaign_id: 'c-std', status: 'active' },
        undefined,
        { replyMode: 'continue' }
      )
    ).toEqual({ action: 'noop' });
  });

  it('noops when target campaign missing and enrollment not active', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e1', campaign_id: 'c-std', status: 'paused' },
        undefined,
        { replyMode: 'pause' }
      )
    ).toEqual({ action: 'noop' });
  });

  it('switches Standard → Emergency when not claimed', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e1', campaign_id: 'c-std', status: 'active', claimed_at: null },
        CAMPAIGNS[0]
      )
    ).toEqual({ action: 'switch', targetCampaignId: 'c-em' });
  });

  it('defers switch while a fresh claim is held (mid-send)', () => {
    const now = new Date('2026-10-28T12:00:00.000Z');
    expect(
      decideReplyEnrollmentAction(
        {
          id: 'e1',
          campaign_id: 'c-std',
          status: 'active',
          claimed_at: '2026-10-28T11:55:00.000Z',
          claim_token: 'tok',
        },
        CAMPAIGNS[0],
        { now }
      )
    ).toEqual({ action: 'defer_switch', targetCampaignId: 'c-em' });
  });

  it('pauses on matching campaign when replyMode=pause', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e1', campaign_id: 'c-em', status: 'active' },
        CAMPAIGNS[0],
        { replyMode: 'pause' }
      )
    ).toEqual({ action: 'pause' });
  });

  it('continues (noop) on matching campaign when replyMode=continue', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e1', campaign_id: 'c-em', status: 'active' },
        CAMPAIGNS[0],
        { replyMode: 'continue' }
      )
    ).toEqual({ action: 'noop' });
  });
});

describe('hasFreshClaim / claimables', () => {
  const now = new Date('2026-10-28T12:20:00.000Z');

  it('detects fresh vs stale claims', () => {
    expect(hasFreshClaim({ claimed_at: '2026-10-28T12:15:00.000Z' }, now)).toBe(
      true
    );
    expect(
      hasFreshClaim(
        {
          claimed_at: new Date(now.getTime() - CLAIM_STALE_MS - 1).toISOString(),
        },
        now
      )
    ).toBe(false);
  });

  it('reclaims stale claims', () => {
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: null,
          claimed_at: new Date(now.getTime() - CLAIM_STALE_MS - 1).toISOString(),
        },
        now
      )
    ).toBe(true);
  });
});

const EMERGENCY_STEPS = [
  { step_number: 1, delay_minutes: 0, template_key: 'emergency_initial' },
  { step_number: 2, delay_minutes: 60, template_key: 'emergency_followup_1' },
];

describe('planEnrollmentStart / selectCampaign', () => {
  it('skips Standard initial when recovery sent', () => {
    const plan = planEnrollmentStart(STANDARD_STEPS, {
      recoveryAlreadySent: true,
      treatRecoveryAsInitial: true,
      now: new Date('2026-10-28T12:00:00.000Z'),
    });
    expect(plan.currentStep).toBe(2);
    expect(plan.skippedInitial).toBe(true);
  });

  it('staging (c): Emergency switch keeps step 1 even when recovery sent', () => {
    const plan = planEnrollmentStart(EMERGENCY_STEPS, {
      recoveryAlreadySent: true,
      treatRecoveryAsInitial: false,
      now: new Date('2026-10-28T12:00:00.000Z'),
    });
    expect(plan.currentStep).toBe(1);
    expect(plan.skippedInitial).toBe(false);
    expect(plan.nextSendAt.toISOString()).toBe('2026-10-28T12:00:00.000Z');
  });

  it('selects Standard when urgency null', () => {
    expect(selectCampaignForUrgency(CAMPAIGNS, null)?.id).toBe('c-std');
  });

  it('selects exact urgency match', () => {
    expect(selectCampaignForUrgency(CAMPAIGNS, 'high')?.id).toBe('c-hi');
  });

  it('throws when campaign has no steps', () => {
    expect(() =>
      planEnrollmentStart([], { recoveryAlreadySent: false })
    ).toThrow('Campaign has no steps');
  });

  it('when only initial skipped and no further steps', () => {
    const plan = planEnrollmentStart(
      [{ step_number: 1, delay_minutes: 0, template_key: 'only' }],
      {
        recoveryAlreadySent: true,
        treatRecoveryAsInitial: true,
        now: new Date('2026-10-28T12:00:00.000Z'),
      }
    );
    expect(plan.skippedInitial).toBe(true);
    expect(plan.currentStep).toBe(1);
  });
});

describe('misc helpers', () => {
  it('classifies insert errors', () => {
    expect(classifyMessageInsertError({ code: '23505' })).toBe('duplicate');
    expect(classifyMessageInsertError(null)).toBe('ok');
  });

  it('ages leads', () => {
    const now = new Date('2026-10-28T00:00:00.000Z');
    expect(isLeadWithinLookupAge('2026-10-27T00:00:00.000Z', now)).toBe(true);
    expect(isLeadWithinLookupAge('2026-10-01T00:00:00.000Z', now)).toBe(false);
  });

  it('reads reply mode and production runtime', () => {
    expect(getCampaignReplyMode({ CAMPAIGN_REPLY_MODE: 'continue' })).toBe(
      'continue'
    );
    expect(getCampaignReplyMode({})).toBe('pause');
    expect(getCampaignReplyMode({ CAMPAIGN_REPLY_MODE: 'PAUSE' })).toBe('pause');
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true);
    expect(isProductionRuntime({ VERCEL_ENV: 'preview' })).toBe(false);
  });

  it('parkedNextSendAt adds 30 minutes', () => {
    const now = new Date('2026-10-28T12:00:00.000Z');
    expect(parkedNextSendAt(now)).toBe('2026-10-28T12:30:00.000Z');
  });

  it('hasFreshClaim rejects invalid dates', () => {
    expect(hasFreshClaim({ claimed_at: 'not-a-date' })).toBe(false);
    expect(hasFreshClaim({ claimed_at: null })).toBe(false);
  });

  it('isLeadWithinLookupAge rejects invalid created_at', () => {
    expect(isLeadWithinLookupAge('invalid')).toBe(false);
  });

  it('isEnrollmentClaimable due when next_send_at passed', () => {
    const now = new Date('2026-10-28T12:00:00.000Z');
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: '2026-10-28T11:00:00.000Z',
          claimed_at: null,
        },
        now
      )
    ).toBe(true);
  });

  it('isEnrollmentClaimable false when not active', () => {
    expect(
      isEnrollmentClaimable(
        { status: 'paused', next_send_at: null, claimed_at: null },
        new Date()
      )
    ).toBe(false);
  });

  it('classifyMessageInsertError failed for other codes', () => {
    expect(classifyMessageInsertError({ code: 'XX' })).toBe('failed');
  });
});
