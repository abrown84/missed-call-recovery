import { redactPhone } from '@/lib/pii';
import { markRelayKeySupportConfirmed } from '@/services/sms-sid';
import type {
  IdempotencyLookupResult,
  MessagingAdapter,
  RelayLookupSupport,
  SendMessageInput,
  SendMessageResult,
} from './types';

/**
 * Replace phone-looking tokens with last-4 redaction.
 * Handles US, international (+44…), and extension suffixes.
 */
export function redactPhonesInText(text: string): string {
  // International / E.164: + and 8–15 digits (keep last 4 only)
  let out = text.replace(/\+\d{8,15}/g, (m) => redactPhone(m));
  // US national with optional formatting / extension
  out = out.replace(
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?:\s*(?:ext\.?|x)\s*\d+)?/gi,
    (m) => redactPhone(m.replace(/\s*(?:ext\.?|x)\s*\d+$/i, ''))
  );
  return out;
}

/**
 * TEST-ONLY adapter: logs the message and returns a fake id.
 * Never hits the BRWN relay or any carrier.
 *
 * Enable with MESSAGING_PROVIDER=dry-run (forbidden in production runtime).
 * For live send freezes prefer SENDS_ENABLED=false — dry-run fakes
 * capabilities + keyEchoed so it must not be treated as production trust.
 *
 * Idempotency store is in-memory only (this.sent) — not durable across
 * processes; see CAMPAIGNS.md.
 */
export class DryRunAdapter implements MessagingAdapter {
  readonly name = 'dry-run';

  /** In-memory log of sends for assertions in tests / staging scripts. */
  readonly sent: SendMessageInput[] = [];

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    this.sent.push(input);
    const id = `dry-run-${Date.now()}-${this.sent.length}`;
    const bodyPreview = redactPhonesInText(input.body).slice(0, 120);
    console.log(
      `[dry-run:test-only] queue SMS to ${redactPhone(input.to)} id=${id} ` +
        `body=${JSON.stringify(bodyPreview)}`
    );
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
