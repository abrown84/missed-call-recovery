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

  it('noop when already on matching campaign and replyMode=continue', () => {
    // Forces !enrollment guard false (must not enroll) and keeps replyMode
    // in the options object (ObjectLiteral {} would default to pause → pause).
    const p = planReplyEnrollment({
      enrollment: {
        id: 'enr',
        campaign_id: 'S',
        status: 'active',
        claimed_at: null,
        claim_token: null,
      },
      campaigns,
      urgency: null,
      replyMode: 'continue',
    });
    expect(p).toEqual({ type: 'noop' });
  });

  it('pause when same campaign and replyMode=pause (explicit)', () => {
    const p = planReplyEnrollment({
      enrollment: {
        id: 'enr',
        campaign_id: 'S',
        status: 'active',
        claimed_at: null,
        claim_token: null,
      },
      campaigns,
      urgency: null,
      replyMode: 'pause',
    });
    expect(p).toEqual({ type: 'pause' });
  });

  it('explicit replyMode wins over env default (?? not &&)', () => {
    const prev = process.env.CAMPAIGN_REPLY_MODE;
    process.env.CAMPAIGN_REPLY_MODE = 'pause';
    try {
      const p = planReplyEnrollment({
        enrollment: {
          id: 'enr',
          campaign_id: 'S',
          status: 'active',
          claimed_at: null,
          claim_token: null,
        },
        campaigns,
        urgency: null,
        replyMode: 'continue',
      });
      // If && were used, env pause would win and we'd get pause — must be noop.
      expect(p.type).toBe('noop');
    } finally {
      if (prev === undefined) delete process.env.CAMPAIGN_REPLY_MODE;
      else process.env.CAMPAIGN_REPLY_MODE = prev;
    }
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

  it('undefined reason coalesces to empty for startsWith and failed for skip', () => {
    // reason ?? '' — filler string would still not start with deferred
    expect(
      mapSwitchResultToReplyAction({
        enrolled: false,
        targetCampaignName: 'E',
      })
    ).toEqual({ action: 'skip:failed', campaignName: 'E' });

    // reason ?? 'failed' must be the exact token
    expect(
      mapSwitchResultToReplyAction({
        enrolled: false,
        reason: undefined,
        targetCampaignName: 'E',
      }).action
    ).toBe('skip:failed');
  });
});

