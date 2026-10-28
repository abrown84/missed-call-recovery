/**
 * Pure payload / step helpers for the campaigns I/O shell.
 * Keeps ObjectLiteral / Arithmetic / sort mutants out of campaigns-impl.
 */

/** Row present AND no error — shared enroll/switch leadFound predicate. */
export function rowFound(row: unknown, error: unknown): boolean {
  return Boolean(row) && !error;
}

/** Stale-claim cutoff ISO (now − CLAIM_STALE_MS). */
export function staleBeforeIso(nowMs: number, staleMs: number): string {
  return new Date(nowMs - staleMs).toISOString();
}

export type StepLike = { step_number: number; delay_minutes?: number };

export function sortCampaignSteps<T extends StepLike>(steps: T[]): T[] {
  return steps.slice().sort((a, b) => a.step_number - b.step_number);
}

export function stepsOrEmpty<T>(steps: T[] | null | undefined): T[] {
  return steps ?? [];
}

export function enrollmentInsertPayload(input: {
  leadId: string;
  campaignId: string;
  currentStep: number;
  status: string;
  nextSendAt: string;
}): Record<string, unknown> {
  return {
    lead_id: input.leadId,
    campaign_id: input.campaignId,
    current_step: input.currentStep,
    status: input.status,
    next_send_at: input.nextSendAt,
    claimed_at: null,
    claim_token: null,
  };
}

export function switchUpdatePayload(input: {
  targetCampaignId: string;
  currentStep: number;
  status: string;
  nextSendAt: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    campaign_id: input.targetCampaignId,
    current_step: input.currentStep,
    status: input.status,
    next_send_at: input.nextSendAt,
    claimed_at: null,
    claim_token: null,
    paused_at: null,
    completed_at: null,
    updated_at: input.nowIso,
  };
}

export function advanceStepPayload(input: {
  nextStepNumber: number;
  nextSendAt: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    current_step: input.nextStepNumber,
    next_send_at: input.nextSendAt,
    claimed_at: null,
    claim_token: null,
    updated_at: input.nowIso,
  };
}

export function completeEnrollmentPayload(input: {
  status: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    completed_at: input.nowIso,
    next_send_at: null,
    claimed_at: null,
    claim_token: null,
    updated_at: input.nowIso,
  };
}

export function pauseEnrollmentPayload(input: {
  status: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    paused_at: input.nowIso,
    next_send_at: null,
    claimed_at: null,
    claim_token: null,
    updated_at: input.nowIso,
  };
}

export function needsReviewEnrollmentPayload(input: {
  status: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    next_send_at: null,
    claimed_at: null,
    claim_token: null,
    paused_at: input.nowIso,
    updated_at: input.nowIso,
  };
}

export function claimDuePayload(input: {
  nowIso: string;
  token: string;
}): Record<string, unknown> {
  return {
    next_send_at: null,
    claimed_at: input.nowIso,
    claim_token: input.token,
    updated_at: input.nowIso,
  };
}

export function reclaimStalePayload(input: {
  nowIso: string;
  token: string;
}): Record<string, unknown> {
  return {
    claimed_at: input.nowIso,
    claim_token: input.token,
    updated_at: input.nowIso,
  };
}

export function releaseClaimPayload(input: {
  nextSendAt: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    claimed_at: null,
    claim_token: null,
    next_send_at: input.nextSendAt,
    updated_at: input.nowIso,
  };
}

export function nextStepDelayMs(delayMinutes: number): number {
  return delayMinutes * 60 * 1000;
}

export function computeNextSendAt(
  nowMs: number,
  delayMinutes: number
): string {
  return new Date(nowMs + nextStepDelayMs(delayMinutes)).toISOString();
}

/** Post-reconcile advance to next step (claim cleared). */
export function reconcileAdvancePayload(input: {
  nextStepNumber: number;
  nextSendAt: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    current_step: input.nextStepNumber,
    next_send_at: input.nextSendAt,
    claimed_at: null,
    claim_token: null,
    updated_at: input.nowIso,
  };
}

/** Post-reconcile complete enrollment. */
export function reconcileCompletePayload(input: {
  status: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    completed_at: input.nowIso,
    next_send_at: null,
    claimed_at: null,
    claim_token: null,
    updated_at: input.nowIso,
  };
}

/** Requeue exact campaign step after abandoned_retry. */
export function requeueStepPayload(input: {
  stepNumber: number;
  nowIso: string;
}): Record<string, unknown> {
  return {
    current_step: input.stepNumber,
    next_send_at: input.nowIso,
    claimed_at: null,
    claim_token: null,
    updated_at: input.nowIso,
  };
}

/** Clear lead outbound sid after recovery never_sent / resend. */
export function clearOutboundSidPayload(input: {
  nowIso: string;
}): Record<string, unknown> {
  return {
    sms_outbound_sid: null,
    updated_at: input.nowIso,
  };
}

/** Cron catch: park enrollment after unexpected throw. */
export function processDueErrorParkPayload(input: {
  nextSendAt: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    claim_token: null,
    claimed_at: null,
    next_send_at: input.nextSendAt,
    updated_at: input.nowIso,
  };
}

/** Flag lead for quiet-hours unresolved timezone. */
export function quietHoursReviewLeadPayload(input: {
  reason: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    needs_human_review: true,
    needs_human_review_at: input.nowIso,
    needs_human_review_reason: input.reason,
  };
}

export const REPLY_ACTION = {
  deferSwitch: 'defer_switch',
  switch: 'switch',
  pause: 'pause',
  enroll: 'enroll',
  noop: 'noop',
} as const;
