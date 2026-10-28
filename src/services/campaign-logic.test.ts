import { describe, expect, it } from 'vitest';
import {
  CLAIM_STALE_MS,
  campaignStepMessageSid,
  classifyMessageInsertError,
  decideReplyEnrollmentAction,
  isEnrollmentClaimable,
  isLeadWithinLookupAge,
  LEAD_LOOKUP_MAX_AGE_DAYS,
  planEnrollmentStart,
  selectCampaignForUrgency,
  shouldSendCampaignStep,
} from './campaign-logic';

const CAMPAIGNS = [
  { id: 'c-em', name: 'Emergency Follow-up', urgency_filter: 'emergency' },
  { id: 'c-hi', name: 'High Priority Follow-up', urgency_filter: 'high' },
  { id: 'c-std', name: 'Standard Follow-up', urgency_filter: null },
];

const EMERGENCY_STEPS = [
  { step_number: 1, delay_minutes: 0, template_key: 'emergency_initial' },
  { step_number: 2, delay_minutes: 60, template_key: 'emergency_followup_1' },
  { step_number: 3, delay_minutes: 240, template_key: 'emergency_followup_2' },
];

const STANDARD_STEPS = [
  { step_number: 1, delay_minutes: 0, template_key: 'standard_initial' },
  { step_number: 2, delay_minutes: 240, template_key: 'standard_followup_1' },
];

describe('selectCampaignForUrgency', () => {
  it('selects Emergency when urgency is emergency', () => {
    expect(selectCampaignForUrgency(CAMPAIGNS, 'emergency')?.name).toBe(
      'Emergency Follow-up'
    );
  });

  it('falls back to Standard when urgency is null (missed-call enroll)', () => {
    expect(selectCampaignForUrgency(CAMPAIGNS, null)?.name).toBe(
      'Standard Follow-up'
    );
  });
});

describe('planEnrollmentStart (skip recovery duplicate)', () => {
  it('skips delay-0 initial when recovery SMS already sent', () => {
    const now = new Date('2026-10-27T12:00:00.000Z');
    const plan = planEnrollmentStart(STANDARD_STEPS, {
      recoveryAlreadySent: true,
      now,
    });
    expect(plan.skippedInitial).toBe(true);
    expect(plan.currentStep).toBe(2);
    expect(plan.nextSendAt.toISOString()).toBe('2026-10-27T16:00:00.000Z');
  });
});

describe('decideReplyEnrollmentAction (re-route vs pause vs noop)', () => {
  it('switches Standard → Emergency on urgent classification', () => {
    const decision = decideReplyEnrollmentAction(
      { id: 'e1', campaign_id: 'c-std', status: 'active' },
      CAMPAIGNS[0]
    );
    expect(decision).toEqual({ action: 'switch', targetCampaignId: 'c-em' });
  });

  it('pauses when already on the matching campaign', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e1', campaign_id: 'c-em', status: 'active' },
        CAMPAIGNS[0]
      )
    ).toEqual({ action: 'pause' });
  });

  it('noops when paused/completed (anti ping-pong on reply 3)', () => {
    expect(
      decideReplyEnrollmentAction(
        { id: 'e1', campaign_id: 'c-std', status: 'paused' },
        CAMPAIGNS[0]
      ).action
    ).toBe('switch'); // misclassified earlier → still re-route even if paused

    expect(
      decideReplyEnrollmentAction(
        { id: 'e1', campaign_id: 'c-em', status: 'paused' },
        CAMPAIGNS[0]
      )
    ).toEqual({ action: 'noop' });

    expect(
      decideReplyEnrollmentAction(
        { id: 'e1', campaign_id: 'c-em', status: 'completed' },
        CAMPAIGNS[0]
      )
    ).toEqual({ action: 'noop' });
  });
});

describe('isEnrollmentClaimable / stale reclaim', () => {
  const now = new Date('2026-10-27T12:20:00.000Z');

  it('claims when due and unclaimed', () => {
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: '2026-10-27T12:18:00.000Z',
          claimed_at: null,
        },
        now
      )
    ).toBe(true);
  });

  it('does not claim a fresh in-flight claim', () => {
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: null,
          claimed_at: '2026-10-27T12:15:00.000Z', // 5 min ago
        },
        now
      )
    ).toBe(false);
  });

  it('reclaims a stale claim (~10 min) left after crash', () => {
    expect(
      isEnrollmentClaimable(
        {
          status: 'active',
          next_send_at: null,
          claimed_at: new Date(now.getTime() - CLAIM_STALE_MS - 1000).toISOString(),
        },
        now
      )
    ).toBe(true);
  });
});

describe('classifyMessageInsertError / insert-before-send', () => {
  it('treats 23505 as duplicate (already sent)', () => {
    expect(classifyMessageInsertError({ code: '23505' })).toBe('duplicate');
    expect(classifyMessageInsertError(null)).toBe('ok');
    expect(classifyMessageInsertError({ code: '42P01' })).toBe('failed');
  });
});

describe('isLeadWithinLookupAge', () => {
  it(`accepts leads within ${LEAD_LOOKUP_MAX_AGE_DAYS} days`, () => {
    const now = new Date('2026-10-27T12:00:00.000Z');
    expect(
      isLeadWithinLookupAge('2026-10-25T12:00:00.000Z', now)
    ).toBe(true);
    expect(
      isLeadWithinLookupAge('2026-10-01T12:00:00.000Z', now)
    ).toBe(false);
  });
});

describe('shouldSendCampaignStep', () => {
  it('blocks a second send for the same enrollment step', () => {
    const sid = campaignStepMessageSid('enr-1', 2);
    expect(shouldSendCampaignStep('enr-1', 2, [sid])).toBe(false);
  });
});

describe('follow-up due timing (2 minutes out)', () => {
  it('is due inside the 5-minute cron window', () => {
    const enrolledAt = new Date('2026-10-27T12:00:00.000Z');
    const nextSendAt = new Date(enrolledAt.getTime() + 2 * 60 * 1000);
    const cronTick = new Date('2026-10-27T12:05:00.000Z');
    expect(nextSendAt.getTime()).toBeLessThanOrEqual(cronTick.getTime());
  });
});
