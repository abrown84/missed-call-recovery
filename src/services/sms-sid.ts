/**
 * Stable SMS idempotency sids and send-state helpers.
 *
 * Campaign: campaign:{enrollmentId}:{campaignId}:step:{n}
 * Recovery: recovery:{leadId}
 */

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

export function campaignStepMessageSid(
  enrollmentId: string,
  campaignId: string,
  stepNumber: number
): string {
  return `campaign:${enrollmentId}:${campaignId}:step:${stepNumber}`;
}

export function recoveryMessageSid(leadId: string): string {
  return `recovery:${leadId}`;
}

export function parseMessageSid(sid: string): ParsedSid {
  // Strip abandon suffix if present
  const base = sid.replace(/:abandoned:\d+$/, '');
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

/**
 * Relay lookup outcome. Only 'never_sent' permits automatic requeue.
 * Bare 404 / arrays / missing fields → 'unknown' (park).
 */
export type RelayLookupOutcome = 'sent' | 'never_sent' | 'unknown';

export function classifyRelayLookupResponse(opts: {
  httpStatus: number;
  body: unknown;
}): RelayLookupOutcome {
  const { httpStatus, body } = opts;

  if (httpStatus === 404) {
    // QC: bare 404 is NOT definite never-sent (endpoint may be missing).
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
  if (obj.found === false) return 'never_sent';
  if (obj.found === true && (obj.id || obj.status)) return 'sent';
  if (typeof obj.id === 'string' && obj.id.length > 0) return 'sent';
  if (obj.exists === false || obj.present === false) return 'never_sent';

  return 'unknown';
}
