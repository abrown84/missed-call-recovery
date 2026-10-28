/**
 * Pure advance / complete planning for advanceEnrollment.
 * I/O shell only applies the returned payload under the claim filters.
 */

import {
  advanceStepPayload,
  completeEnrollmentPayload,
  computeNextSendAt,
} from '@/services/campaign-io-plans';

export type AdvancePlan =
  | {
      type: 'advance';
      payload: ReturnType<typeof advanceStepPayload>;
      nextStepNumber: number;
      nextSendAt: string;
    }
  | {
      type: 'complete';
      payload: ReturnType<typeof completeEnrollmentPayload>;
    };

export function nextStepNumberOf(currentStepNumber: number): number {
  return currentStepNumber + 1;
}

export function findStepByNumber<T extends { step_number: number }>(
  steps: T[],
  stepNumber: number
): T | undefined {
  return steps.find((s) => s.step_number === stepNumber);
}

export function planAdvanceEnrollment(input: {
  currentStepNumber: number;
  steps: Array<{ step_number: number; delay_minutes: number }>;
  nowMs: number;
  statusCompleted: string;
}): AdvancePlan {
  const nextStepNumber = nextStepNumberOf(input.currentStepNumber);
  const nextStep = findStepByNumber(input.steps, nextStepNumber);
  const nowIso = new Date(input.nowMs).toISOString();

  if (nextStep) {
    const nextSendAt = computeNextSendAt(input.nowMs, nextStep.delay_minutes);
    return {
      type: 'advance',
      nextStepNumber,
      nextSendAt,
      payload: advanceStepPayload({
        nextStepNumber,
        nextSendAt,
        nowIso,
      }),
    };
  }

  return {
    type: 'complete',
    payload: completeEnrollmentPayload({
      status: input.statusCompleted,
      nowIso,
    }),
  };
}

/** Update succeeded when no error and at least one row returned. */
export function ownershipHit(
  error: unknown,
  data: unknown[] | null | undefined
): boolean {
  return !error && Boolean(data?.length);
}
