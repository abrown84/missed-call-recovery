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
   * Stable idempotency key (`mlf:…`).
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
   * Keyed send hit 429 { error: 'recent_send' } — treat as unknown
   * (park + reconcile), not a hard failure.
   */
  ambiguous?: boolean;
  /**
   * Relay returned 409 { error: 'idempotency_conflict', idempotencyKey } —
   * key bound to a different (to,body). needs_review, never success.
   */
  conflict?: boolean;
  /** Relay echoed idempotencyKey in the response (required for key_supported_at_send). */
  keyEchoed?: boolean;
}

/**
 * Lookup by idempotency key (relay >= 1.7.6).
 * found:true body uses `toLast4` (not `to`).
 * Only `never_sent` permits requeue, and only when key_supported_at_send was set.
 */
export type IdempotencyLookupResult =
  | { outcome: 'sent'; found: true; id: string; status: string }
  | { outcome: 'failed'; found: true; id: string; status: 'failed' | string }
  | { outcome: 'never_sent'; found: false }
  | { outcome: 'unknown'; found: false };

export type RelayCapabilities = {
  relay?: string;
  version?: string;
  idempotency: boolean;
};

export type RelayLookupSupport =
  | { supported: true; capabilities: RelayCapabilities }
  | { supported: false; reason: string; httpStatus?: number };

export interface MessagingAdapter {
  readonly name: string;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  lookupByIdempotencyKey?(
    key: string
  ): Promise<IdempotencyLookupResult>;
  /**
   * Probe GET /api/capabilities (relay >= 1.7.6).
   * supported when body includes idempotency:true.
   */
  checkLookupSupport?(): Promise<RelayLookupSupport>;
}
