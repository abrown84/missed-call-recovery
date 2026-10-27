import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { validateTwilioWebhook } from '@/lib/twilio-webhook';
import { redactPhone } from '@/lib/pii';
import { classifyUrgency } from '@/services/classification';
import { escalateLead } from '@/services/escalation';
import { pauseCampaignForLead } from '@/services/campaigns';

export const dynamic = 'force-dynamic';

/**
 * Twilio SMS Reply Webhook
 * Configure: /api/webhooks/twilio/sms-reply
 */
export async function POST(request: NextRequest) {
  try {
    const params = await validateTwilioWebhook(request);
    if (!params) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const MessageSid = params.MessageSid;
    const From = params.From;
    const To = params.To;
    const Body = params.Body ?? '';

    if (!MessageSid || !From || !To) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Cap inbound body length to limit abuse / storage cost
    const body = Body.slice(0, 1600);

    const supabase = createServerClient();

    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('*')
      .eq('phone', To)
      .single();

    if (bizError || !business) {
      console.error('Business not found for number:', redactPhone(To));
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', business.id)
      .eq('caller_phone', From)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (leadError || !lead) {
      console.error('No pending lead found for:', redactPhone(From));
      return NextResponse.json({ status: 'no_lead_found' });
    }

    await supabase.from('sms_messages').insert({
      lead_id: lead.id,
      direction: 'inbound',
      body,
      message_sid: MessageSid,
      status: 'received',
    });

    const classification = await classifyUrgency(body, business.vertical);

    const { error: updateError } = await supabase
      .from('leads')
      .update({
        status: 'qualified',
        urgency: classification.urgency,
        issue: classification.issue,
        sms_response_text: body,
        classified_at: new Date().toISOString(),
      })
      .eq('id', lead.id);

    if (updateError) {
      console.error('Failed to update lead:', updateError.message);
    }

    pauseCampaignForLead(lead.id).catch((err) => {
      console.error(
        'Failed to pause campaign:',
        err instanceof Error ? err.message : 'unknown'
      );
    });

    if (classification.urgency === 'emergency' || classification.urgency === 'high') {
      await escalateLead(lead.id, business, classification);
    }

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        headers: { 'Content-Type': 'application/xml' },
      }
    );
  } catch (error) {
    console.error(
      'SMS webhook error:',
      error instanceof Error ? error.message : 'unknown'
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
