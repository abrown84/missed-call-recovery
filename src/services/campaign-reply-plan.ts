/**
 * Pure reply → enrollment action applicator plan.
 * handleClassifiedReplyEnrollment I/O shell only executes the plan.
 */

import { decideReplyEnrollmentAction, getCampaignReplyMode } from '@/services/campaign-logic';
import { REPLY_ACTION } from '@/services/campaign-io-plans';
import { selectCampaignForUrgency } from '@/services/campaign-logic';

export type ReplyEnrollmentPlan =
  | { type: 'defer_switch'; campaignName: string }
  | { type: 'switch'; targetCampaignId: string; campaignName: string }
  | { type: 'pause' }
  | { type: 'enroll' }
  | { type: 'noop' };

export function planReplyEnrollment(input: {
  enrollment: {
    id: string;
    campaign_id: string;
    status: string;
    claimed_at: string | null;
    claim_token: string | null;
  } | null;
  campaigns: Array<{ id: string; name: string; urgency_filter: string | null }>;
  urgency: string | null;
  replyMode?: string;
}): ReplyEnrollmentPlan {
  const replyMode = input.replyMode ?? getCampaignReplyMode();
  const target = selectCampaignForUrgency(input.campaigns, input.urgency);
  const decision = decideReplyEnrollmentAction(
    input.enrollment,
    target,
    { replyMode }
  );

  if (decision.action === REPLY_ACTION.deferSwitch && target) {
    return { type: 'defer_switch', campaignName: target.name };
  }
  if (decision.action === REPLY_ACTION.switch && target) {
    return {
      type: 'switch',
      targetCampaignId: target.id,
      campaignName: target.name,
    };
  }
  if (decision.action === REPLY_ACTION.pause) {
    return { type: 'pause' };
  }
  if (!input.enrollment) {
    return { type: 'enroll' };
  }
  return { type: 'noop' };
}

/** Map switchEnrollmentCampaign result → reply action token. */
export function mapSwitchResultToReplyAction(input: {
  enrolled: boolean;
  reason?: string;
  campaignName?: string;
  targetCampaignName: string;
}): { action: string; campaignName?: string } {
  // Stryker disable next-line StringLiteral: empty coalesce — see EQUIVALENT.md reply-plan-reason-empty-coalesce
  const reason = input.reason ?? '';
  if (!input.enrolled && reason.startsWith('deferred')) {
    return { action: 'defer_switch', campaignName: input.targetCampaignName };
  }
  return {
    action: input.enrolled ? 'switch' : `skip:${input.reason ?? 'failed'}`,
    campaignName: input.enrolled
      ? input.campaignName
      : input.targetCampaignName,
  };
}
