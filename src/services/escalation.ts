import { createServerClient } from '@/lib/supabase';
import { sendSMS } from '@/lib/twilio';
import { redactId, redactPhone } from '@/lib/pii';
import type { ClassificationResult } from '@/types';
import type { Database } from '@/types/database';

type Business = Database['public']['Tables']['businesses']['Row'];

/**
 * Lead Escalation Service
 * Routes high-urgency and emergency leads to the appropriate party
 */

export async function escalateLead(
  leadId: string,
  business: Business,
  classification: ClassificationResult
): Promise<void> {
  const supabase = createServerClient();

  // Get the lead details
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*, missed_calls(*)')
    .eq('id', leadId)
    .single();

  if (error || !lead) {
    console.error('Failed to fetch lead for escalation:', error);
    return;
  }

  // Determine escalation target
  const escalationPhone = business.emergency_phone || business.phone;

  // Build escalation message
  const urgencyEmoji = classification.urgency === 'emergency' ? '🚨' : '⚠️';
  const escalationMessage = buildEscalationMessage(
    urgencyEmoji,
    classification,
    lead.caller_phone,
    lead.sms_response_text || 'No response text'
  );

  try {
    // Send escalation SMS to business owner/dispatcher
    await sendSMS(
      escalationPhone,
      business.phone,
      escalationMessage
    );

    // Update lead status
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
  } catch (err) {
    console.error(
      'Escalation failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    throw err;
  }
}

function buildEscalationMessage(
  emoji: string,
  classification: ClassificationResult,
  callerPhone: string,
  responseText: string
): string {
  const lines = [
    `${emoji} ${classification.urgency.toUpperCase()} LEAD`,
    `Phone: ${callerPhone}`,
    `Issue: ${classification.issue || 'Not specified'}`,
    `Keywords: ${classification.keywords.join(', ') || 'None'}`,
    `Response: "${responseText.slice(0, 100)}"`,
    `Call back ASAP!`,
  ];

  return lines.join('\n');
}

/**
 * Check if we should escalate based on time and business hours
 */
export function shouldEscalate(
  business: Business,
  urgency: ClassificationResult['urgency']
): boolean {
  // Always escalate emergencies
  if (urgency === 'emergency') return true;

  // High urgency during business hours
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
