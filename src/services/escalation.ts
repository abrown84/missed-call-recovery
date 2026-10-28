import { createServerClient } from '@/lib/supabase';
import { redactId, redactPhone } from '@/lib/pii';
import { sendMessage } from '@/services/send';
import type { ClassificationResult } from '@/types';
import type { Database } from '@/types/database';

type Business = Database['public']['Tables']['businesses']['Row'];

/**
 * Lead Escalation Service — routes via the single send module (no direct relay).
 */

export async function escalateLead(
  leadId: string,
  business: Business,
  classification: ClassificationResult
): Promise<void> {
  const supabase = createServerClient();

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*, missed_calls(*)')
    .eq('id', leadId)
    .single();

  if (error || !lead) {
    console.error('Failed to fetch lead for escalation:', error);
    return;
  }

  const escalationPhone = business.emergency_phone || business.phone;
  const urgencyEmoji = classification.urgency === 'emergency' ? '🚨' : '⚠️';
  const escalationMessage = buildEscalationMessage(
    urgencyEmoji,
    classification,
    lead.caller_phone,
    lead.sms_response_text || 'No response text'
  );

  const outcome = await sendMessage({
    kind: 'escalation',
    leadId,
    businessId: business.id,
    to: escalationPhone,
    body: escalationMessage,
    businessTimezone: business.timezone,
    skipQuietHours: true,
    auto: true,
  });

  if (outcome.kind !== 'sent' && outcome.kind !== 'ambiguous') {
    console.error(
      'Escalation blocked/failed:',
      outcome.kind,
      'reason' in outcome ? outcome.reason : ''
    );
    if (outcome.kind === 'needs_review' || outcome.kind === 'blocked') {
      throw new Error(`Escalation ${outcome.kind}`);
    }
  }

  await supabase
    .from('leads')
    .update({
      status: 'escalated',
      escalated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  console.log(
    `Lead ${redactId(leadId)} escalated to ${redactPhone(escalationPhone)}`
  );
}

function buildEscalationMessage(
  emoji: string,
  classification: ClassificationResult,
  callerPhone: string,
  responseText: string
): string {
  return [
    `${emoji} ${classification.urgency.toUpperCase()} LEAD`,
    `Phone: ${callerPhone}`,
    `Issue: ${classification.issue || 'Not specified'}`,
    `Keywords: ${classification.keywords.join(', ') || 'None'}`,
    `Response: "${responseText.slice(0, 100)}"`,
    `Call back ASAP!`,
  ].join('\n');
}

/** Cap retries for owner notify SMS (QC r10/r11). */
export const OWNER_NOTIFY_MAX_ATTEMPTS = 3;

/**
 * Exponential backoff before retries (ms). Index 0 unused (no wait before first
 * attempt); after failure on attempt n wait OWNER_NOTIFY_BACKOFF_MS[n] before n+1.
 * QC r11: 200ms, 800ms (≈ 200 * 2^(attempt-1)).
 */
export const OWNER_NOTIFY_BACKOFF_MS = [0, 200, 800] as const;

export type OwnerNotifySleep = (ms: number) => Promise<void>;

const defaultSleep: OwnerNotifySleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function notifyOwnerWithRetries(
  leadId: string,
  business: Business,
  message: string,
  alertLabel: string,
  sleep: OwnerNotifySleep = defaultSleep
): Promise<boolean> {
  const escalationPhone = business.emergency_phone || business.phone;
  let lastKind = 'unknown';
  let lastReason = '';

  for (let attempt = 1; attempt <= OWNER_NOTIFY_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const wait = OWNER_NOTIFY_BACKOFF_MS[attempt - 1] ?? 800;
      if (wait > 0) await sleep(wait);
    }

    const outcome = await sendMessage({
      kind: 'escalation',
      leadId,
      businessId: business.id,
      to: escalationPhone,
      body: message,
      businessTimezone: business.timezone,
      skipQuietHours: true,
      auto: true,
    });

    if (outcome.kind === 'sent' || outcome.kind === 'ambiguous') {
      console.log(
        `${alertLabel} notified for lead ${redactId(leadId)} → ${redactPhone(escalationPhone)} (attempt ${attempt})`
      );
      return true;
    }

    lastKind = outcome.kind;
    lastReason = 'reason' in outcome ? String(outcome.reason) : '';
    console.error(
      `${alertLabel} notify failed (attempt ${attempt}/${OWNER_NOTIFY_MAX_ATTEMPTS}):`,
      lastKind,
      lastReason
    );
  }

  console.error(
    `ALERT: ${alertLabel} owner notify exhausted retries`,
    JSON.stringify({
      leadId: redactId(leadId),
      lastKind,
      lastReason,
      attempts: OWNER_NOTIFY_MAX_ATTEMPTS,
    })
  );
  return false;
}

/**
 * Notify the business owner that a reply may be an opt-out (ambiguous keyword
 * in a longer sentence). Does not change lead status to escalated — that is
 * reserved for classified high/emergency urgency.
 *
 * Retries up to OWNER_NOTIFY_MAX_ATTEMPTS with exponential backoff. On exhaustion
 * logs an ALERT and returns false so inbound can fail closed (HTTP 5xx → BRWN
 * relay retry).
 */
export async function notifyPossibleOptOut(
  leadId: string,
  business: Business,
  body: string,
  reason: string,
  sleep: OwnerNotifySleep = defaultSleep
): Promise<boolean> {
  const message = [
    '⚠️ POSSIBLE OPT-OUT — campaign paused',
    `Lead: ${leadId}`,
    `Reason: ${reason}`,
    `Reply: "${body.slice(0, 160)}"`,
    'Review before sending more texts.',
  ].join('\n');
  return notifyOwnerWithRetries(
    leadId,
    business,
    message,
    'possible-opt-out',
    sleep
  );
}

/**
 * Alert the owner when a lead parks because the caller area code has no mapped
 * timezone (QC r11). Unknown zone → unresolved quiet hours → no customer SMS.
 */
export async function notifyUnresolvedTimezone(
  leadId: string,
  business: Business,
  callerPhone: string,
  sleep: OwnerNotifySleep = defaultSleep
): Promise<boolean> {
  const message = [
    '⚠️ UNKNOWN TIMEZONE — campaign send parked',
    `Lead: ${leadId}`,
    `Caller: ${callerPhone}`,
    'Area code has no quiet-hours zone map entry.',
    'Review / set lead timezone before sending.',
  ].join('\n');
  return notifyOwnerWithRetries(
    leadId,
    business,
    message,
    'unresolved-timezone',
    sleep
  );
}

export function shouldEscalate(
  business: Business,
  urgency: ClassificationResult['urgency']
): boolean {
  if (urgency === 'emergency') return true;

  if (urgency === 'high') {
    const now = new Date();
    const currentHour = now.getHours();
    const startHour = parseInt(business.business_hours_start.split(':')[0]);
    const endHour = parseInt(business.business_hours_end.split(':')[0]);
    const isDuringBusinessHours = currentHour >= startHour && currentHour < endHour;
    return isDuringBusinessHours || business.after_hours_enabled;
  }

  return false;
}
