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

export interface IdempotencyLookupResult {
  found: boolean;
  id?: string;
  status?: string;
}

export interface MessagingAdapter {
  readonly name: string;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  /**
   * Optional: look up a prior send by idempotency key (for stuck/unknown reconcile).
   * Return { found: false } when the relay has no record.
   */
  lookupByIdempotencyKey?(
    key: string
  ): Promise<IdempotencyLookupResult>;
}
