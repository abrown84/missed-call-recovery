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
 * 404 / 405 (pre-v1.7.5) / arrays / missing fields → 'unknown' (park).
 *
 * Supported shape (relay >= 1.7.5):
 *   { found: false }
 *   | { found: true, id, to, status, error, created, updated, attempts, auto }
 */
export type RelayLookupOutcome = 'sent' | 'never_sent' | 'unknown';

export function classifyRelayLookupResponse(opts: {
  httpStatus: number;
  body: unknown;
}): RelayLookupOutcome {
  const { httpStatus, body } = opts;

  // Pre-v1.7.5 relays return 405 Method Not Allowed for GET /api/messages.
  // Bare 404 also means lookup is missing — never treat as never_sent.
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
  if (obj.found === false) return 'never_sent';
  if (obj.found === true && (obj.id || obj.status)) return 'sent';
  return 'unknown';
}
