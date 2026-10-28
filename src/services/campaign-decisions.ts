/**
 * Pure campaign enrollment / send orchestration decisions (no DB, no relay).
 */

import {
  planEnrollmentStart,
  parkedNextSendAt,
  type StepLike,
} from '@/services/campaign-logic';
import {
  interpretCampaignSendOutcome,
  type CampaignSendAction,
} from '@/services/send/decisions';
import type { SendOutcome } from '@/services/send/types';

export type RecoverySendState =
  | 'confirmed'
  | 'pending'
  | 'absent'
  | 'abandoned';

export type EnrollmentGate =
  | { ok: false; reason: string }
  | { ok: true };

/** Pre-insert enrollment gates (lead fetch / opt-out / existing). */
export function decideEnrollmentGates(input: {
  leadFound: boolean;
  optedOut: boolean;
  existingStatus?: string | null;
}): EnrollmentGate {
  if (!input.leadFound) return { ok: false, reason: 'lead_not_found' };
  if (input.optedOut) return { ok: false, reason: 'opted_out' };
  if (input.existingStatus != null) {
    return { ok: false, reason: `already_enrolled:${input.existingStatus}` };
  }
  return { ok: true };
}

export type EnrollmentPlanDecision =
  | { ok: false; reason: string }
  | {
      ok: true;
      currentStep: number;
      nextSendAt: string;
      skippedInitial: boolean;
    };

/** Pure plan after campaign + steps + recovery state are known. */
export function decideEnrollmentPlan(input: {
  steps: StepLike[];
  recoveryState: RecoverySendState;
  recoveryConfirmed: boolean;
  treatRecoveryAsInitial: boolean;
  now?: Date;
  parkedIso?: string;
}): EnrollmentPlanDecision {
  if (input.steps.length === 0) {
    return { ok: false, reason: 'no_steps' };
  }
  const plan = planEnrollmentStart(input.steps, {
    recoveryAlreadySent: input.recoveryConfirmed,
    treatRecoveryAsInitial: input.treatRecoveryAsInitial,
    now: input.now,
  });
  if (
    plan.skippedInitial &&
    plan.currentStep === input.steps[0].step_number &&
    input.steps.length === 1
  ) {
    return { ok: false, reason: 'only_initial_already_sent' };
  }
  let nextSendAt = plan.nextSendAt.toISOString();
  if (input.recoveryState === 'pending' && !input.recoveryConfirmed) {
    nextSendAt =
      input.parkedIso ?? parkedNextSendAt(input.now ?? new Date());
  }
  return {
    ok: true,
    currentStep: plan.currentStep,
    nextSendAt,
    skippedInitial: plan.skippedInitial,
  };
}

/** Map resolveRecoveryOutcome → recovery send state used by enrollment. */
export function mapRecoveryOutcomeToState(
  outcome: string
): RecoverySendState {
  if (outcome === 'resolved_sent') return 'confirmed';
  if (outcome === 'resolved_abandoned') return 'abandoned';
  if (outcome === 'pending') return 'pending';
  return 'absent';
}

/** Whether campaign step 1 should skip the recovery gate. */
export function decideSkipRecoveryGate(input: {
  delayMinutes: number;
  currentStep: number;
  firstStepNumber: number | undefined;
}): boolean {
  return !(
    input.delayMinutes === 0 &&
    input.currentStep === input.firstStepNumber
  );
}

export type CampaignSendDispatch = CampaignSendAction & {
  /** Boolean return for sendCampaignSMS. */
  success: boolean;
};

/** Pure outcome → action + success flag for sendCampaignSMS. */
export function decideCampaignSendDispatch(
  outcome: SendOutcome,
  parkedFallbackIso: string
): CampaignSendDispatch {
  const action = interpretCampaignSendOutcome(outcome, parkedFallbackIso);
  switch (action.type) {
    case 'advance':
    case 'pause_opt_out':
      return { ...action, success: true };
    case 'release':
      return { ...action, success: action.ok };
    case 'park':
    case 'needs_review_terminal':
    case 'flag_unresolved_tz':
    case 'noop_false':
      return { ...action, success: false };
    default: {
      const _exhaustive: never = action;
      return { type: 'noop_false', success: false, ...(_exhaustive as object) };
    }
  }
}

/** Pre-send lead gates inside sendCampaignSMS. */
export function decideCampaignLeadGates(input: {
  optedOut: boolean;
  suppressed: boolean;
  suppressionLookupFailed: boolean;
}):
  | { action: 'pause'; success: true }
  | { action: 'release_fail'; success: false }
  | { action: 'continue' } {
  if (input.optedOut || input.suppressed) {
    return { action: 'pause', success: true };
  }
  if (input.suppressionLookupFailed) {
    return { action: 'release_fail', success: false };
  }
  return { action: 'continue' };
}

/** Switch/enroll claim freshness gate. */
export function decideSwitchClaimGate(input: {
  hasEnrollment: boolean;
  freshClaim: boolean;
}): EnrollmentGate {
  if (!input.hasEnrollment) return { ok: false, reason: 'no_enrollment' };
  if (input.freshClaim) return { ok: false, reason: 'deferred_fresh_claim' };
  return { ok: true };
}

/** After reconcile confirms send: may we advance? */
export function decideReconcileAdvanceEligibility(input: {
  enrollmentFound: boolean;
  campaignMatches: boolean;
  stepMatches: boolean;
  hasClaimToken: boolean;
}): boolean {
  if (!input.enrollmentFound) return false;
  if (!input.campaignMatches) return false;
  if (!input.stepMatches) return false;
  if (input.hasClaimToken) return false;
  return true;
}

/** Requeue exact step eligibility. */
export function decideRequeueEligibility(input: {
  enrollmentFound: boolean;
  campaignMatches: boolean;
}): boolean {
  return input.enrollmentFound && input.campaignMatches;
}
