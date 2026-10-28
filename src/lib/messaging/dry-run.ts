import { redactPhone } from '@/lib/pii';
import { markRelayKeySupportConfirmed } from '@/services/sms-sid';
import type {
  IdempotencyLookupResult,
  MessagingAdapter,
  RelayLookupSupport,
  SendMessageInput,
  SendMessageResult,
} from './types';

/** Replace E.164 / national phone-looking tokens with last-4 redaction. */
export function redactPhonesInText(text: string): string {
  return text.replace(
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    (m) => redactPhone(m)
  );
}

/**
 * TEST-ONLY adapter: logs the message and returns a fake id.
 * Never hits the BRWN relay or any carrier.
 *
 * Enable with MESSAGING_PROVIDER=dry-run (forbidden in production runtime).
 * For live send freezes prefer SENDS_ENABLED=false — dry-run fakes
 * capabilities + keyEchoed so it must not be treated as production trust.
 */
export class DryRunAdapter implements MessagingAdapter {
  readonly name = 'dry-run';

  /** In-memory log of sends for assertions in tests / staging scripts. */
  readonly sent: SendMessageInput[] = [];

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    this.sent.push(input);
    const id = `dry-run-${Date.now()}-${this.sent.length}`;
    // Redact phones inside the body (escalation messages embed caller numbers).
    const bodyPreview = redactPhonesInText(input.body).slice(0, 120);
    console.log(
      `[dry-run:test-only] queue SMS to ${redactPhone(input.to)} id=${id} ` +
        `body=${JSON.stringify(bodyPreview)}`
    );
    // TEST-ONLY: echoes key so unit tests can exercise key_supported paths.
    // Idempotency store is in-memory only (this.sent) — not durable across
    // processes; see CAMPAIGNS.md.
    return {
      id,
      status: 'queued',
      ...(input.idempotencyKey ? { keyEchoed: true } : {}),
    };
  }

  async lookupByIdempotencyKey(
    key: string
  ): Promise<IdempotencyLookupResult> {
    const hit = this.sent.find((s) => s.idempotencyKey === key);
    if (!hit) return { outcome: 'never_sent', found: false };
    return {
      outcome: 'sent',
      found: true,
      id: `dry-run-lookup`,
      status: 'queued',
    };
  }

  async checkLookupSupport(): Promise<RelayLookupSupport> {
    // TEST-ONLY: pretends caps.idempotency=true. Not production trust.
    markRelayKeySupportConfirmed();
    return {
      supported: true,
      capabilities: {
        relay: 'dry-run-test-only',
        version: 'test',
        idempotency: true,
      },
    };
  }
}
