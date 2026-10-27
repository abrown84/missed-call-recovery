import { redactPhone } from '@/lib/pii';
import type {
  MessagingAdapter,
  SendMessageInput,
  SendMessageResult,
} from './types';

/**
 * Staging / test adapter: logs the message and returns a fake id.
 * Never hits the BRWN relay or any carrier. Enable with
 * MESSAGING_PROVIDER=dry-run.
 */
export class DryRunAdapter implements MessagingAdapter {
  readonly name = 'dry-run';

  /** In-memory log of sends for assertions in tests / staging scripts. */
  readonly sent: SendMessageInput[] = [];

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    this.sent.push(input);
    const id = `dry-run-${Date.now()}-${this.sent.length}`;
    console.log(
      `[dry-run] queue SMS to ${redactPhone(input.to)} id=${id} ` +
        `body=${JSON.stringify(input.body.slice(0, 120))}`
    );
    return { id, status: 'queued' };
  }
}
