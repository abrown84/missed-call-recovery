/**
 * Stable SMS idempotency sids and send-state helpers.
 *
 * All keys are prefixed with `mlf:` so the BRWN relay can bind key→(to,body).
 * Campaign: mlf:campaign:{enrollmentId}:{campaignId}:step:{n}
 * Recovery: mlf:recovery:{leadId}
 */
// @ts-nocheck


export const IDEMPOTENCY_KEY_PREFIX = 'mlf:';

export type ParsedSid =
  | {
      kind: 'campaign';
      enrollmentId: string;
      campaignId: string;
      stepNumber: number;
    }
  | { kind: 'recovery'; leadId: string }
  | { kind: 'unknown'; raw: string };

export const CONFIRMED_SMS_STATUSES = new Set([
  'queued',
  'dispatched',
  'sent',
  'delivered',
]);

export const AMBIGUOUS_SMS_STATUSES = new Set(['sending', 'unknown']);
export const FAILED_SMS_STATUSES = new Set(['failed']);

export function withIdempotencyPrefix(sid: string): string {
  return sid.startsWith(IDEMPOTENCY_KEY_PREFIX)
    ? sid
    : `${IDEMPOTENCY_KEY_PREFIX}${sid}`;
}

export function stripIdempotencyPrefix(sid: string): string {
  return sid.startsWith(IDEMPOTENCY_KEY_PREFIX)
    ? sid.slice(IDEMPOTENCY_KEY_PREFIX.length)
    : sid;
}

export function campaignStepMessageSid(
  enrollmentId: string,
  campaignId: string,
  stepNumber: number
): string {
  return withIdempotencyPrefix(
    `campaign:${enrollmentId}:${campaignId}:step:${stepNumber}`
  );
}

export function recoveryMessageSid(leadId: string): string {
  return withIdempotencyPrefix(`recovery:${leadId}`);
}

export function parseMessageSid(sid: string): ParsedSid {
  // Strip mlf: prefix and abandon suffix if present
  const base = stripIdempotencyPrefix(sid).replace(/:abandoned:\d+$/, '');
  const campaign = /^campaign:([^:]+):([^:]+):step:(\d+)$/.exec(base);
  if (campaign) {
    return {
      kind: 'campaign',
      enrollmentId: campaign[1],
      campaignId: campaign[2],
      stepNumber: Number(campaign[3]),
    };
  }
  const recovery = /^recovery:(.+)$/.exec(base);
  if (recovery) {
    return { kind: 'recovery', leadId: recovery[1] };
  }
  return { kind: 'unknown', raw: sid };
}

export function isConfirmedSmsStatus(status: string | null | undefined): boolean {
  return Boolean(status && CONFIRMED_SMS_STATUSES.has(status));
}

export function isAmbiguousSmsStatus(status: string | null | undefined): boolean {
  return Boolean(status && AMBIGUOUS_SMS_STATUSES.has(status));
}

export function isFailedSmsStatus(status: string | null | undefined): boolean {
  return Boolean(status && FAILED_SMS_STATUSES.has(String(status).toLowerCase()));
}

/**
 * Relay lookup outcome (relay >= 1.7.6).
 * - never_sent: ONLY explicit { found: false } (requeue only when
 *   key_supported_at_send was set — caps.idempotency before send + key echo)
 * - failed: found:true but status=failed → needs_review, never advance
 * - unknown: 404/405/arrays/missing
 * found:true body uses toLast4 (not to).
 */
export type RelayLookupOutcome = 'sent' | 'never_sent' | 'unknown' | 'failed';

export function classifyRelayLookupResponse(opts: {
  httpStatus: number;
  body: unknown;
}): RelayLookupOutcome {
  const { httpStatus, body } = opts;

  if (httpStatus === 404 || httpStatus === 405) {
    return 'unknown';
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return 'unknown';
  }
  if (Array.isArray(body)) {
    return 'unknown';
  }
  if (body == null || typeof body !== 'object') {
    return 'unknown';
  }

  const obj = body as Record<string, unknown>;
  // Only the explicit FastAPI `found` boolean decides never_sent.
  // Do NOT treat exists/present/legacy fields as never_sent.
  if (obj.found === false) return 'never_sent';
  if (obj.found === true) {
    if (isFailedSmsStatus(String(obj.status ?? ''))) return 'failed';
    if (obj.id || obj.status) return 'sent';
  }
  return 'unknown';
}

/** Recovery send resolution used to gate campaign step 1. */
export type RecoverySendState =
  | 'confirmed'
  | 'pending'
  | 'absent'
  | 'abandoned';

export function classifyRecoverySmsStatus(
  status: string | null | undefined
): RecoverySendState {
  if (!status) return 'absent';
  if (isConfirmedSmsStatus(status)) return 'confirmed';
  if (status === 'abandoned_retry') return 'abandoned';
  if (
    isAmbiguousSmsStatus(status) ||
    status === 'needs_review' ||
    isFailedSmsStatus(status)
  ) {
    return 'pending';
  }
  return 'absent';
}

/** Process-local: set true once GET lookup probe succeeds this process. */
let relayKeySupportConfirmed = false;

export function markRelayKeySupportConfirmed(): void {
  relayKeySupportConfirmed = true;
}

export function isRelayKeySupportConfirmed(): boolean {
  return relayKeySupportConfirmed;
}

export function resetRelayKeySupportConfirmed(): void {
  relayKeySupportConfirmed = false;
}
