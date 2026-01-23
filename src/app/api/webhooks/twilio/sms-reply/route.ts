import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { classifyUrgency } from '@/services/classification';
import { escalateLead } from '@/services/escalation';
import { pauseCampaignForLead } from '@/services/campaigns';
import type { TwilioSMSPayload } from '@/types';

// Force dynamic rendering (no static generation)
export const dynamic = 'force-dynamic';

/**
 * Twilio SMS Reply Webhook
 * Triggered when a customer replies to our recovery SMS
 *
 * Configure this URL in Twilio: /api/webhooks/twilio/sms-reply
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(formData) as unknown as TwilioSMSPayload;

    const { MessageSid, From, To, Body } = payload;

    const supabase = createServerClient();

    // Find the business by their Twilio number
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('*')
      .eq('phone', To)
      .single();

    if (bizError || !business) {
      console.error('Business not found for number:', To);
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Find the most recent pending lead for this caller
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
      console.error('No pending lead found for:', From);
      // Still log the message even if no lead found
      return NextResponse.json({ status: 'no_lead_found' });
    }

    // Record the inbound SMS
    await supabase.from('sms_messages').insert({
      lead_id: lead.id,
      direction: 'inbound',
      body: Body,
      message_sid: MessageSid,
      status: 'received',
    });

    // Classify urgency based on response
    const classification = await classifyUrgency(Body, business.vertical);

    // Update the lead with classification
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        status: 'qualified',
        urgency: classification.urgency,
        issue: classification.issue,
        sms_response_text: Body,
        classified_at: new Date().toISOString(),
      })
      .eq('id', lead.id);

    if (updateError) {
      console.error('Failed to update lead:', updateError);
    }

    // Pause any active campaigns since lead has responded
    pauseCampaignForLead(lead.id).catch((err) => {
      console.error('Failed to pause campaign:', err);
    });

    // Emergency leads get immediate escalation
    if (classification.urgency === 'emergency' || classification.urgency === 'high') {
      await escalateLead(lead.id, business, classification);
    }

    // Return TwiML response (empty = no auto-reply)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        headers: { 'Content-Type': 'application/xml' },
      }
    );
  } catch (error) {
    console.error('SMS webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
