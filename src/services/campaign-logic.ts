/**
 * Pure campaign enrollment / send planning helpers (no I/O).
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
  claimed_at?: string | null;
  claim_token?: string | null;
}

/** Max age for matching an inbound SMS to a prior lead (days). */
export const LEAD_LOOKUP_MAX_AGE_DAYS = 7;

/** Stale claim reclaim window. */
export const CLAIM_STALE_MS = 10 * 60 * 1000;

/** How long a 'sending' row may sit before reconcile. */
export const STUCK_SENDING_MS = 10 * 60 * 1000;

/** Default alert threshold for unknown/stuck rows in a cron run. */
export const UNKNOWN_SMS_ALERT_THRESHOLD = 5;

/**
 * Reply handling after classification when already on the matching campaign.
 * - pause (default): stop follow-ups when the customer replies
 * - continue: keep the sequence running (open design question for Alex)
 */
export type CampaignReplyMode = 'pause' | 'continue';

export function getCampaignReplyMode(
  env: Record<string, string | undefined> = process.env
): CampaignReplyMode {
  const v = (env.CAMPAIGN_REPLY_MODE || 'pause').trim().toLowerCase();
  return v === 'continue' ? 'continue' : 'pause';
}

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

// Sid helpers live in sms-sid.ts (single source of truth for parse/confirm).
export {
  campaignStepMessageSid,
  recoveryMessageSid,
  parseMessageSid,
  isConfirmedSmsStatus,
  isAmbiguousSmsStatus,
  classifyRelayLookupResponse,
  CONFIRMED_SMS_STATUSES,
  AMBIGUOUS_SMS_STATUSES,
} from '@/services/sms-sid';
import { campaignStepMessageSid } from '@/services/sms-sid';

/** Far-future next_send_at used to park enrollments until reconcile runs. */
export const PARKED_SEND_MS = 365 * 24 * 60 * 60 * 1000;

export function parkedNextSendAt(now: Date = new Date()): string {
  return new Date(now.getTime() + PARKED_SEND_MS).toISOString();
}

export function shouldSendCampaignStep(
  enrollmentId: string,
  campaignId: string,
  stepNumber: number,
  existingOutboundSids: Array<string | null | undefined>
): boolean {
  const sid = campaignStepMessageSid(enrollmentId, campaignId, stepNumber);
  return !existingOutboundSids.some((existing) => existing === sid);
}

export type ReplyEnrollmentAction =
  | { action: 'switch'; targetCampaignId: string }
  | { action: 'pause' }
  | { action: 'noop' }
  | { action: 'defer_switch'; targetCampaignId: string };

/**
 * Decide enrollment action for a classified reply.
 * When a fresh claim is held, switches are deferred (mid-send race).
 */
export function decideReplyEnrollmentAction(
  enrollment: EnrollmentLike | null | undefined,
  targetCampaign: CampaignLike | undefined,
  options: {
    replyMode?: CampaignReplyMode;
    now?: Date;
    claimStaleMs?: number;
  } = {}
): ReplyEnrollmentAction {
  const replyMode = options.replyMode ?? 'pause';
  const now = options.now ?? new Date();
  const staleMs = options.claimStaleMs ?? CLAIM_STALE_MS;

  if (!enrollment) {
    return { action: 'noop' };
  }
  if (!targetCampaign) {
    if (enrollment.status === 'active' && replyMode === 'pause') {
      return { action: 'pause' };
    }
    return { action: 'noop' };
  }

  if (enrollment.campaign_id !== targetCampaign.id) {
    if (hasFreshClaim(enrollment, now, staleMs)) {
      return {
        action: 'defer_switch',
        targetCampaignId: targetCampaign.id,
      };
    }
    return { action: 'switch', targetCampaignId: targetCampaign.id };
  }

  if (enrollment.status === 'active' && replyMode === 'pause') {
    return { action: 'pause' };
  }
  return { action: 'noop' };
}

/** True when claimed_at is set and younger than the stale window. */
export function hasFreshClaim(
  enrollment: { claimed_at?: string | null },
  now: Date = new Date(),
  staleMs: number = CLAIM_STALE_MS
): boolean {
  if (!enrollment.claimed_at) return false;
  const claimedAt = new Date(enrollment.claimed_at).getTime();
  if (Number.isNaN(claimedAt)) return false;
  return now.getTime() - claimedAt < staleMs;
}

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

  return claimedAt != null && now.getTime() - claimedAt >= staleMs;
}

export const PG_UNIQUE_VIOLATION = '23505';

export function classifyMessageInsertError(
  error: { code?: string } | null | undefined
): 'ok' | 'duplicate' | 'failed' {
  if (!error) return 'ok';
  if (error.code === PG_UNIQUE_VIOLATION) return 'duplicate';
  return 'failed';
}

/** True when dry-run must be rejected (production runtime). */
export function isProductionRuntime(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
  );
}
