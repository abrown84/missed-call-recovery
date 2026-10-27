import { describe, expect, it } from 'vitest';
import {
  campaignStepMessageSid,
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
  it('selects Emergency when urgency is emergency (not Standard)', () => {
    const selected = selectCampaignForUrgency(CAMPAIGNS, 'emergency');
    expect(selected?.name).toBe('Emergency Follow-up');
  });

  it('selects High when urgency is high', () => {
    const selected = selectCampaignForUrgency(CAMPAIGNS, 'high');
    expect(selected?.name).toBe('High Priority Follow-up');
  });

  it('falls back to Standard when urgency is null (pre-classification bug case)', () => {
    const selected = selectCampaignForUrgency(CAMPAIGNS, null);
    expect(selected?.name).toBe('Standard Follow-up');
  });

  it('falls back to Standard for normal/low (no dedicated campaign)', () => {
    expect(selectCampaignForUrgency(CAMPAIGNS, 'normal')?.name).toBe(
      'Standard Follow-up'
    );
    expect(selectCampaignForUrgency(CAMPAIGNS, 'low')?.name).toBe(
      'Standard Follow-up'
    );
  });
});

describe('planEnrollmentStart (idempotent first text)', () => {
  it('starts at step 1 immediately when no recovery SMS was sent', () => {
    const now = new Date('2026-10-27T12:00:00.000Z');
    const plan = planEnrollmentStart(EMERGENCY_STEPS, {
      recoveryAlreadySent: false,
      now,
    });
    expect(plan.currentStep).toBe(1);
    expect(plan.skippedInitial).toBe(false);
    expect(plan.nextSendAt.toISOString()).toBe(now.toISOString());
  });

  it('skips delay-0 initial when recovery SMS already sent (no duplicate first text)', () => {
    const now = new Date('2026-10-27T12:00:00.000Z');
    const plan = planEnrollmentStart(EMERGENCY_STEPS, {
      recoveryAlreadySent: true,
      now,
    });
    expect(plan.skippedInitial).toBe(true);
    expect(plan.currentStep).toBe(2);
    expect(plan.nextSendAt.toISOString()).toBe('2026-10-27T13:00:00.000Z');
  });

  it('schedules Standard step 2 four hours out after skipping initial', () => {
    const now = new Date('2026-10-27T12:00:00.000Z');
    const plan = planEnrollmentStart(STANDARD_STEPS, {
      recoveryAlreadySent: true,
      now,
    });
    expect(plan.currentStep).toBe(2);
    expect(plan.nextSendAt.toISOString()).toBe('2026-10-27T16:00:00.000Z');
  });
});

describe('shouldSendCampaignStep / campaignStepMessageSid', () => {
  it('builds a stable sid per enrollment step', () => {
    expect(campaignStepMessageSid('enr-1', 2)).toBe('campaign:enr-1:step:2');
  });

  it('blocks a second send for the same enrollment step', () => {
    const sid = campaignStepMessageSid('enr-1', 2);
    expect(shouldSendCampaignStep('enr-1', 2, [sid])).toBe(false);
    expect(shouldSendCampaignStep('enr-1', 2, ['other-sid'])).toBe(true);
    expect(shouldSendCampaignStep('enr-1', 3, [sid])).toBe(true);
  });
});

describe('follow-up due timing (2 minutes out)', () => {
  it('marks a lead due within the 5-minute cron window', () => {
    const enrolledAt = new Date('2026-10-27T12:00:00.000Z');
    const nextSendAt = new Date(enrolledAt.getTime() + 2 * 60 * 1000);
    const cronTick = new Date('2026-10-27T12:05:00.000Z'); // worst-case 5-min cron

    expect(nextSendAt.getTime()).toBeLessThanOrEqual(cronTick.getTime());
    expect(cronTick.getTime() - nextSendAt.getTime()).toBeLessThanOrEqual(
      5 * 60 * 1000
    );
  });
});
