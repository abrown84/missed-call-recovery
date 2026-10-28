/**
 * Provider-agnostic messaging surface.
 * Default implementation: BRWN Text relay (Android device as the SMS node).
 */

export type MessageDeliveryStatus =
  | 'queued'
  | 'dispatched'
  | 'sent'
  | 'delivered'
  | 'failed';

export interface SendMessageInput {
  to: string;
  body: string;
  /** When true (default), relay treats the message as automated. */
  auto?: boolean;
  /**
   * Stable idempotency key (campaign step sid / recovery sid).
   * Sent as JSON body field `idempotencyKey` (not a header) on BRWN relay.
   */
  idempotencyKey?: string;
}

export interface SendMessageResult {
  id: string;
  status: MessageDeliveryStatus | string;
  /** Relay returned 200 with duplicate:true for this idempotencyKey. */
  duplicate?: boolean;
  /**
   * Keyed send hit 429 recent_send — treat as unknown (park + reconcile),
   * not a hard failure.
   */
  ambiguous?: boolean;
}

/**
 * Lookup by idempotency key.
 * Only `never_sent` permits automatic requeue. Bare 404 / 405 / arrays /
 * missing fields / HTTP errors → `unknown` (park; do not requeue).
 *
 * Relay >= v1.7.5 GET /api/messages?idempotencyKey= returns:
 *   { found: false } | { found: true, id, to, status, error, created, updated, attempts, auto }
 */
export type IdempotencyLookupResult =
  | { outcome: 'sent'; found: true; id: string; status: string }
  | { outcome: 'never_sent'; found: false }
  | { outcome: 'unknown'; found: false };

export type RelayLookupSupport =
  | { supported: true }
  | { supported: false; reason: string; httpStatus?: number };

export interface MessagingAdapter {
  readonly name: string;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  /**
   * Optional: look up a prior send by idempotency key (for stuck/unknown reconcile).
   * Return outcome='never_sent' ONLY when the relay explicitly confirms absence.
   */
  lookupByIdempotencyKey?(
    key: string
  ): Promise<IdempotencyLookupResult>;
  /** Optional: probe whether GET idempotency lookup is available (relay >= v1.7.5). */
  checkLookupSupport?(): Promise<RelayLookupSupport>;
}
