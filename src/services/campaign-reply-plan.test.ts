import { describe, expect, it } from 'vitest';
import {
  mapSwitchResultToReplyAction,
  planReplyEnrollment,
} from './campaign-reply-plan';

const campaigns = [
  { id: 'S', name: 'Standard', urgency_filter: null as string | null },
  { id: 'E', name: 'Emergency', urgency_filter: 'emergency' },
];

describe('planReplyEnrollment', () => {
  it('enroll when no enrollment', () => {
    expect(
      planReplyEnrollment({
        enrollment: null,
        campaigns,
        urgency: null,
      })
    ).toEqual({ type: 'enroll' });
  });

  it('switch to Emergency on high urgency when enrolled in Standard', () => {
    const p = planReplyEnrollment({
      enrollment: {
        id: 'enr',
        campaign_id: 'S',
        status: 'active',
        claimed_at: null,
        claim_token: null,
      },
      campaigns,
      urgency: 'emergency',
    });
    expect(p.type).toBe('switch');
    if (p.type === 'switch') {
      expect(p.targetCampaignId).toBe('E');
      expect(p.campaignName).toBe('Emergency');
    }
  });

  it('defer_switch when fresh claim held', () => {
    const p = planReplyEnrollment({
      enrollment: {
        id: 'enr',
        campaign_id: 'S',
        status: 'active',
        claimed_at: new Date().toISOString(),
        claim_token: 'tok',
      },
      campaigns,
      urgency: 'emergency',
    });
    expect(p.type).toBe('defer_switch');
    if (p.type === 'defer_switch') {
      expect(p.campaignName).toBe('Emergency');
    }
  });
});

describe('mapSwitchResultToReplyAction', () => {
  it('maps deferred reason to defer_switch', () => {
    expect(
      mapSwitchResultToReplyAction({
        enrolled: false,
        reason: 'deferred_or_switch_failed',
        targetCampaignName: 'Emergency',
      })
    ).toEqual({ action: 'defer_switch', campaignName: 'Emergency' });
  });

  it('maps success and non-deferred failure', () => {
    expect(
      mapSwitchResultToReplyAction({
        enrolled: true,
        campaignName: 'Emergency',
        targetCampaignName: 'Emergency',
      })
    ).toEqual({ action: 'switch', campaignName: 'Emergency' });

    expect(
      mapSwitchResultToReplyAction({
        enrolled: false,
        reason: 'no_steps',
        targetCampaignName: 'Emergency',
      })
    ).toEqual({ action: 'skip:no_steps', campaignName: 'Emergency' });
  });

  it('startsWith deferred is required (not endsWith)', () => {
    expect(
      mapSwitchResultToReplyAction({
        enrolled: false,
        reason: 'x_deferred',
        targetCampaignName: 'E',
      }).action
    ).toBe('skip:x_deferred');
  });
});
