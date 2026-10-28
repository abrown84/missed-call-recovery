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
  /** Stable idempotency key (campaign step sid / recovery sid) if the relay supports it. */
  idempotencyKey?: string;
}

export interface SendMessageResult {
  id: string;
  status: MessageDeliveryStatus | string;
}

/**
 * Lookup by idempotency key.
 * Only `never_sent` permits automatic requeue. Bare 404 / arrays / missing
 * fields / HTTP errors → `unknown` (park; do not requeue).
 */
export type IdempotencyLookupResult =
  | { outcome: 'sent'; found: true; id: string; status: string }
  | { outcome: 'never_sent'; found: false }
  | { outcome: 'unknown'; found: false };

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
}
