/**
 * Shared table / column / status literals used by send-path I/O shells.
 * Kept here so StringLiteral mutants are killed by direct constant tests
 * instead of surviving inside thick supabase call chains.
 */

export const TABLE = {
  leads: 'leads',
  businesses: 'businesses',
  smsMessages: 'sms_messages',
  campaigns: 'campaigns',
  campaignSteps: 'campaign_steps',
  campaignEnrollments: 'campaign_enrollments',
} as const;

export const SMS_STATUS = {
  sending: 'sending',
  deferred: 'deferred',
  unknown: 'unknown',
  needsReview: 'needs_review',
  abandonedRetry: 'abandoned_retry',
  abandonedDone: 'abandoned_done',
  queued: 'queued',
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
export const CAMPAIGN_SELECT_STAR_STEPS = '*, campaign_steps(*)';
export const CAMPAIGN_SELECT_URGENCY = 'id, name, urgency_filter';
export const STEP_SELECT_STAR = '*';
export const ENROLLMENT_SELECT_SEND =
  '*, leads!inner(*, businesses(*)), campaigns!inner(*)';
export const ENROLLMENT_SELECT_ADVANCE =
  'id, campaign_id, current_step, status, claim_token';
export const ENROLLMENT_SELECT_REQUEUE = 'id, campaign_id, status';

export const PG_UNIQUE = '23505';
