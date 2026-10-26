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
}

export interface SendMessageResult {
  id: string;
  status: MessageDeliveryStatus | string;
}

export interface MessagingAdapter {
  readonly name: string;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}
