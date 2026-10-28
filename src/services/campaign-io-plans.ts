/**
 * Pure payload / step helpers for the campaigns I/O shell.
 * Keeps ObjectLiteral / Arithmetic / sort mutants out of campaigns-impl.
 */

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

export const REPLY_ACTION = {
  deferSwitch: 'defer_switch',
  switch: 'switch',
  pause: 'pause',
  enroll: 'enroll',
  noop: 'noop',
} as const;
