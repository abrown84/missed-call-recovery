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
