import { createServerClient } from '@/lib/supabase';
import { sendSMS } from '@/lib/twilio';
import { redactPhone } from '@/lib/pii';
import type { Database } from '@/types/database';

type Business = Database['public']['Tables']['businesses']['Row'];

/**
 * SMS Outreach Service
 * Sends recovery SMS to missed callers within seconds
 */

// Default SMS templates by vertical
const SMS_TEMPLATES: Record<string, string> = {
  plumbing: `Hi, this is {business}. We noticed we missed your call. What plumbing issue can we help you with today? Reply here or call us back!`,
  hvac: `Hi, this is {business}. Sorry we missed your call! Are you having a heating/cooling issue? Reply with details and we'll get back to you ASAP.`,
  electrical: `Hi, this is {business}. We missed your call - what electrical issue can we help with? Reply here and we'll respond quickly!`,
  general: `Hi, this is {business}. Sorry we missed your call! How can we help you today? Reply here or call us back.`,
};

export async function sendRecoverySMS(
  leadId: string,
  business: Business,
  callerPhone: string
): Promise<void> {
  const supabase = createServerClient();

  // Get SMS template (from business settings or default)
  const customTemplate = (business.settings as Record<string, unknown>)?.smsTemplate as string | undefined;
  const template = customTemplate || SMS_TEMPLATES[business.vertical] || SMS_TEMPLATES.general;

  // Personalize the message
  const messageBody = template.replace('{business}', business.name);

  try {
    // Send via Twilio
    const message = await sendSMS(callerPhone, business.phone, messageBody);

    // Record the outbound SMS
    await supabase.from('sms_messages').insert({
      lead_id: leadId,
      direction: 'outbound',
      body: messageBody,
      message_sid: message.sid,
      status: message.status,
    });

    // Update lead with outbound SID
    await supabase
      .from('leads')
      .update({ sms_outbound_sid: message.sid })
      .eq('id', leadId);

    console.log(
      `Recovery SMS sent to ${redactPhone(callerPhone)}, SID: ${message.sid}`
    );
  } catch (error) {
    console.error(
      'Failed to send recovery SMS:',
      error instanceof Error ? error.message : 'unknown'
    );
    throw error;
  }
}

export async function sendFollowUpSMS(
  leadId: string,
  business: Business,
  callerPhone: string,
  customMessage?: string
): Promise<void> {
  const supabase = createServerClient();

  const messageBody = customMessage ||
    `Hi, just following up from ${business.name}. Still need help? Reply here or give us a call!`;

  try {
    const message = await sendSMS(callerPhone, business.phone, messageBody);

    await supabase.from('sms_messages').insert({
      lead_id: leadId,
      direction: 'outbound',
      body: messageBody,
      message_sid: message.sid,
      status: message.status,
    });

    console.log(
      `Follow-up SMS sent to ${redactPhone(callerPhone)}, SID: ${message.sid}`
    );
  } catch (error) {
    console.error(
      'Failed to send follow-up SMS:',
      error instanceof Error ? error.message : 'unknown'
    );
    throw error;
  }
}
