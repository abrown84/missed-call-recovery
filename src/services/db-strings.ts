/**
 * Shared table / column / status literals used by send-path I/O shells.
 * Kept here so StringLiteral mutants are killed by direct constant tests
 * instead of surviving inside thick supabase call chains.
 *
 * ignoreStatic: module-level const initializers are not mutated; I/O files
 * reference these instead of inline 'id' / 'status' / filter fragments.
 */

export const TABLE = {
  leads: 'leads',
  businesses: 'businesses',
  smsMessages: 'sms_messages',
  campaigns: 'campaigns',
  campaignSteps: 'campaign_steps',
  campaignEnrollments: 'campaign_enrollments',
} as const;

/** PostgREST / SQL column names used in .eq / .order / .select. */
export const COL = {
  id: 'id',
  leadId: 'lead_id',
  messageSid: 'message_sid',
  status: 'status',
  body: 'body',
  nextRetryAt: 'next_retry_at',
  nextSendAt: 'next_send_at',
  claimToken: 'claim_token',
  claimedAt: 'claimed_at',
  campaignId: 'campaign_id',
  stepNumber: 'step_number',
  autoEnroll: 'auto_enroll',
  sentAt: 'sent_at',
  smsOutboundSid: 'sms_outbound_sid',
  optedOut: 'opted_out',
} as const;

export const SMS_STATUS = {
  sending: 'sending',
  deferred: 'deferred',
  unknown: 'unknown',
  needsReview: 'needs_review',
  abandonedRetry: 'abandoned_retry',
  abandonedDone: 'abandoned_done',
  queued: 'queued',
  dispatched: 'dispatched',
  sent: 'sent',
  delivered: 'delivered',
  active: 'active',
  paused: 'paused',
  completed: 'completed',
} as const;

export const ENROLLMENT_STATUS = {
  active: 'active',
  paused: 'paused',
  completed: 'completed',
  needsReview: 'needs_review',
} as const;

export const DIRECTION_OUTBOUND = 'outbound';

export const LEAD_SELECT_GATES = 'opted_out, timezone, sms_outbound_sid';
export const SMS_SELECT_STATUS = 'status';
export const SMS_SELECT_ID_STATUS = 'id, status';
export const SMS_SELECT_DEFERRED =
  'id, lead_id, message_sid, body, next_retry_at';
export const SMS_SELECT_RECONCILE =
  'id, lead_id, message_sid, status, sent_at, reconcile_attempts, key_supported_at_send, next_retry_at';
export const SMS_SELECT_ABANDONED = 'id, lead_id, message_sid, status';
export const SMS_SELECT_CONFIRMED = 'message_sid, status';
export const LEAD_SELECT_STAR_BIZ = '*, businesses(*)';
export const LEAD_SELECT_OPTED_OUT = 'opted_out';
export const LEAD_SELECT_OUTBOUND = 'sms_outbound_sid';
export const ENROLLMENT_SELECT_STAR = '*';
export const ENROLLMENT_SELECT_ID = 'id';
export const CAMPAIGN_SELECT_STAR_STEPS = '*, campaign_steps(*)';
export const CAMPAIGN_SELECT_URGENCY = 'id, name, urgency_filter';
export const STEP_SELECT_STAR = '*';
export const ENROLLMENT_SELECT_SEND =
  '*, leads!inner(*, businesses(*)), campaigns!inner(*)';
export const ENROLLMENT_SELECT_ADVANCE =
  'id, campaign_id, current_step, status, claim_token';
export const ENROLLMENT_SELECT_REQUEUE = 'id, campaign_id, status';

export const PG_UNIQUE = '23505';

/** Statuses considered confirmed delivery for post-reconcile advance. */
export const CONFIRMED_PROVIDER_STATUSES = [
  SMS_STATUS.queued,
  SMS_STATUS.dispatched,
  SMS_STATUS.sent,
  SMS_STATUS.delivered,
] as const;

/** Reconcile cron pulls unknown + stuck sending. */
export const RECONCILE_PULL_STATUSES = [
  SMS_STATUS.unknown,
  SMS_STATUS.sending,
] as const;

export const CAMPAIGN_SID_LIKE = 'mlf:campaign:%';

export const ABANDONED_SID_RE = /:abandoned:\d+$/;

export const REVIEW_REASON_QUIET_HOURS = 'quiet_hours_unresolved';

export const KIND_RECOVERY = 'recovery';
export const KIND_CAMPAIGN = 'campaign';
export const KIND_MANUAL = 'manual';

export const SEND_REASON = {
  invalidPhone: 'invalid_phone',
  duplicateInFlight: 'duplicate_in_flight',
  lookupUnsupported: 'lookup_unsupported',
  sendsDisabled: 'sends_disabled',
} as const;

export const RELAY_SIGNAL = {
  error: 'error',
  unknown: 'unknown',
  ok: 'ok',
} as const;

export const LOOKUP_KIND = 'lookup';

export function reconcileOrFilter(nowIso: string, cutoff: string): string {
  return (
    `and(status.eq.unknown,next_retry_at.is.null),` +
    `and(status.eq.unknown,next_retry_at.lte.${nowIso}),` +
    `and(status.eq.sending,sent_at.lt.${cutoff})`
  );
}
