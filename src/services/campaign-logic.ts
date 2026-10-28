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

export interface EnrollmentLike {
  id: string;
  campaign_id: string;
  status: string;
}

/** Max age for matching an inbound SMS to a prior lead (days). */
export const LEAD_LOOKUP_MAX_AGE_DAYS = 7;

/** Stale claim reclaim window. */
export const CLAIM_STALE_MS = 10 * 60 * 1000;

/**
 * Pick the campaign whose urgency_filter matches the lead, else the
 * catch-all (urgency_filter === null).
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

/**
 * Decide what to do with an existing enrollment when a classified reply arrives.
 * - switch: urgency points at a different campaign (e.g. Standard → Emergency)
 * - pause: already on the right campaign (or no better match) and still active
 * - noop: already paused/completed — never re-enroll (anti ping-pong)
 */
export type ReplyEnrollmentAction =
  | { action: 'switch'; targetCampaignId: string }
  | { action: 'pause' }
  | { action: 'noop' };

export function decideReplyEnrollmentAction(
  enrollment: EnrollmentLike | null | undefined,
  targetCampaign: CampaignLike | undefined
): ReplyEnrollmentAction {
  if (!enrollment) {
    // Caller should enroll fresh; not used when missed-call always enrolls.
    return { action: 'noop' };
  }
  if (!targetCampaign) {
    return enrollment.status === 'active' ? { action: 'pause' } : { action: 'noop' };
  }
  if (enrollment.campaign_id !== targetCampaign.id) {
    return { action: 'switch', targetCampaignId: targetCampaign.id };
  }
  if (enrollment.status === 'active') {
    return { action: 'pause' };
  }
  return { action: 'noop' };
}

/** True when a lead createdAt is within the inbound lookup window. */
export function isLeadWithinLookupAge(
  createdAt: string | Date,
  now: Date = new Date(),
  maxAgeDays: number = LEAD_LOOKUP_MAX_AGE_DAYS
): boolean {
  const created =
    typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  if (Number.isNaN(created.getTime())) return false;
  const ageMs = now.getTime() - created.getTime();
  return ageMs >= 0 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

/**
 * Claim eligibility for an active enrollment.
 * Due: next_send_at <= now and not currently claimed (or claim is stale).
 * Stale reclaim: claimed_at older than CLAIM_STALE_MS with next_send_at null.
 */
export function isEnrollmentClaimable(
  row: {
    status: string;
    next_send_at: string | null;
    claimed_at: string | null;
  },
  now: Date = new Date(),
  staleMs: number = CLAIM_STALE_MS
): boolean {
  if (row.status !== 'active') return false;

  const claimedAt = row.claimed_at ? new Date(row.claimed_at).getTime() : null;
  const claimIsFresh =
    claimedAt != null && now.getTime() - claimedAt < staleMs;

  if (claimIsFresh) return false;

  if (row.next_send_at != null) {
    return new Date(row.next_send_at).getTime() <= now.getTime();
  }

  // Stuck after crash: claimed, next_send_at cleared, claim went stale.
  return claimedAt != null && now.getTime() - claimedAt >= staleMs;
}

/** Postgres unique-violation SQLSTATE. */
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * Classify an insert error for the insert-before-send path.
 * duplicate → treat as already sent; other → real failure.
 */
export function classifyMessageInsertError(
  error: { code?: string } | null | undefined
): 'ok' | 'duplicate' | 'failed' {
  if (!error) return 'ok';
  if (error.code === PG_UNIQUE_VIOLATION) return 'duplicate';
  return 'failed';
}
