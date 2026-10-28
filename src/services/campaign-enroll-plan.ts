/**
 * Pure enroll / switch planners — I/O shell only fetches + applies.
 */

import {
  decideEnrollmentGates,
  decideEnrollmentPlan,
  decideSwitchClaimGate,
} from '@/services/campaign-decisions';
import { planEnrollmentStart } from '@/services/campaign-logic';
import {
  enrollmentInsertPayload,
  sortCampaignSteps,
  stepsOrEmpty,
  switchUpdatePayload,
} from '@/services/campaign-io-plans';
import { selectCampaignForUrgency } from '@/services/campaign-logic';

export type StepRow = {
  step_number: number;
  delay_minutes: number;
  template_key?: string;
};

export type CampaignRow = {
  id: string;
  name: string;
  urgency_filter: string | null;
  campaign_steps?: StepRow[] | null;
};

export type EnrollPlan =
  | { type: 'reject'; reason: string }
  | {
      type: 'insert';
      payload: Record<string, unknown>;
      result: {
        enrolled: true;
        campaignId: string;
        campaignName: string;
        currentStep: number;
        nextSendAt: string;
        skippedInitial: boolean;
      };
    };

export function planEnroll(input: {
  leadId: string;
  leadFound: boolean;
  optedOut: boolean;
  existingStatus: string | null;
  campaigns: CampaignRow[] | null;
  campaignError: boolean;
  urgency: string | null;
  recoveryState: 'confirmed' | 'abandoned' | 'pending' | 'absent';
  smsOutboundSid: string | null;
  statusActive?: string;
}): EnrollPlan {
  const gate = decideEnrollmentGates({
    leadFound: input.leadFound,
    optedOut: input.optedOut,
    existingStatus: input.existingStatus,
  });
  if (!gate.ok) {
    return { type: 'reject', reason: gate.reason };
  }
  // gate.ok ⇒ leadFound (decideEnrollmentGates); no second lead check.
  if (
    input.campaignError ||
    !input.campaigns ||
    input.campaigns.length === 0
  ) {
    return { type: 'reject', reason: 'no_campaigns' };
  }
  const selected = selectCampaignForUrgency(input.campaigns, input.urgency);
  if (!selected) {
    return { type: 'reject', reason: 'no_matching_campaign' };
  }
  const steps = sortCampaignSteps(
    stepsOrEmpty(selected.campaign_steps as StepRow[] | null)
  );
  // Empty steps also rejected inside decideEnrollmentPlan. if(false)/{} on this
  // guard falls through to the same no_steps reject — truly equivalent.
  // if(true) would reject non-empty steps and is killed by enroll tests.
  // Stryker disable next-line ConditionalExpression,BlockStatement
  if (steps.length === 0) {
    return { type: 'reject', reason: 'no_steps' };
  }
  const recoveryConfirmed =
    input.recoveryState === 'confirmed' || Boolean(input.smsOutboundSid);
  const plan = decideEnrollmentPlan({
    steps,
    recoveryState: input.recoveryState,
    recoveryConfirmed,
    treatRecoveryAsInitial: selected.urgency_filter == null,
  });
  if (!plan.ok) {
    return { type: 'reject', reason: plan.reason };
  }
  const status = input.statusActive ?? 'active';
  return {
    type: 'insert',
    payload: enrollmentInsertPayload({
      leadId: input.leadId,
      campaignId: selected.id,
      currentStep: plan.currentStep,
      status,
      nextSendAt: plan.nextSendAt,
    }),
    result: {
      enrolled: true,
      campaignId: selected.id,
      campaignName: selected.name,
      currentStep: plan.currentStep,
      nextSendAt: plan.nextSendAt,
      skippedInitial: plan.skippedInitial,
    },
  };
}

export type SwitchPlan =
  | { type: 'reject'; reason: string }
  | {
      type: 'update';
      payload: Record<string, unknown>;
      result: {
        enrolled: true;
        campaignId: string;
        campaignName: string;
        currentStep: number;
        nextSendAt: string;
        skippedInitial: boolean;
        switched: true;
      };
    };

export function planSwitch(input: {
  hasEnrollment: boolean;
  freshClaim: boolean;
  leadFound: boolean;
  campaignFound: boolean;
  campaign: CampaignRow | null;
  targetCampaignId: string;
  smsOutboundSid: string | null;
  nowIso: string;
  statusActive?: string;
}): SwitchPlan {
  const switchGate = decideSwitchClaimGate({
    hasEnrollment: input.hasEnrollment,
    freshClaim: input.freshClaim,
  });
  if (!switchGate.ok) {
    return { type: 'reject', reason: switchGate.reason };
  }
  if (!input.leadFound) {
    return { type: 'reject', reason: 'lead_not_found' };
  }
  if (!input.campaignFound || !input.campaign) {
    return { type: 'reject', reason: 'campaign_not_found' };
  }
  const steps = sortCampaignSteps(
    stepsOrEmpty(input.campaign.campaign_steps as StepRow[] | null)
  );
  if (steps.length === 0) {
    return { type: 'reject', reason: 'no_steps' };
  }
  // Staging (c): never treat recovery as Emergency/High initial.
  // recoveryAlreadySent is ignored while treatRecoveryAsInitial is false —
  // both false and true keep step 1; the options object is still required.
  // Stryker disable next-line ObjectLiteral -- treatRecoveryAsInitial:false makes recoveryAlreadySent a no-op
  const plan = planEnrollmentStart(steps, {
    recoveryAlreadySent: Boolean(input.smsOutboundSid),
    treatRecoveryAsInitial: false,
  });
  const nextSendAt = plan.nextSendAt.toISOString();
  const status = input.statusActive ?? 'active';
  return {
    type: 'update',
    payload: switchUpdatePayload({
      targetCampaignId: input.targetCampaignId,
      currentStep: plan.currentStep,
      status,
      nextSendAt,
      nowIso: input.nowIso,
    }),
    result: {
      enrolled: true,
      campaignId: input.targetCampaignId,
      campaignName: input.campaign.name,
      currentStep: plan.currentStep,
      nextSendAt,
      skippedInitial: plan.skippedInitial,
      switched: true,
    },
  };
}
