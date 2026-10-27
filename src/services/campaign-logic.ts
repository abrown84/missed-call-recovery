/**
 * Pure campaign enrollment / send planning helpers (no I/O).
 * Kept separate so unit tests can cover urgency routing and idempotency
 * without mocking Supabase.
 */

export interface CampaignLike {
  id: string;
  name: string;
  urgency_filter: string | null;
}

export interface StepLike {
  step_number: number;
  delay_minutes: number;
  template_key?: string;
}

export interface EnrollmentStartPlan {
  currentStep: number;
  nextSendAt: Date;
  skippedInitial: boolean;
}

/**
 * Pick the campaign whose urgency_filter matches the lead, else the
 * catch-all (urgency_filter === null). Used after classification so
 * Emergency / High sequences can actually win.
 */
export function selectCampaignForUrgency<T extends CampaignLike>(
  campaigns: T[],
  urgency: string | null | undefined
): T | undefined {
  if (urgency != null) {
    const exact = campaigns.find((c) => c.urgency_filter === urgency);
    if (exact) return exact;
  }
  return campaigns.find((c) => c.urgency_filter === null);
}

/**
 * Decide which step to start on and when the next send is due.
 *
 * When the missed-call recovery SMS already went out, skip a delay-0
 * "initial" step so the cron does not duplicate the first text.
 */
export function planEnrollmentStart(
  steps: StepLike[],
  options: { recoveryAlreadySent: boolean; now?: Date }
): EnrollmentStartPlan {
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);
  if (sorted.length === 0) {
    throw new Error('Campaign has no steps');
  }

  const now = options.now ?? new Date();
  let startIdx = 0;
  let skippedInitial = false;

  if (options.recoveryAlreadySent && sorted[0].delay_minutes === 0) {
    startIdx = 1;
    skippedInitial = true;
  }

  // Only an initial step existed and it was skipped — nothing left to schedule.
  if (startIdx >= sorted.length) {
    return {
      currentStep: sorted[0].step_number,
      nextSendAt: now,
      skippedInitial,
    };
  }

  const step = sorted[startIdx];
  return {
    currentStep: step.step_number,
    nextSendAt: new Date(now.getTime() + step.delay_minutes * 60 * 1000),
    skippedInitial,
  };
}

/** Stable sid so the same enrollment step is never sent twice. */
export function campaignStepMessageSid(
  enrollmentId: string,
  stepNumber: number
): string {
  return `campaign:${enrollmentId}:step:${stepNumber}`;
}

/**
 * Whether a due enrollment should still send for this step, given any
 * prior outbound sids recorded for the lead.
 */
export function shouldSendCampaignStep(
  enrollmentId: string,
  stepNumber: number,
  existingOutboundSids: Array<string | null | undefined>
): boolean {
  const sid = campaignStepMessageSid(enrollmentId, stepNumber);
  return !existingOutboundSids.some((existing) => existing === sid);
}
