import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendRecoverySMS } from '@/services/sms';
import type { TwilioCallStatusPayload } from '@/types';

// Force dynamic rendering (no static generation)
export const dynamic = 'force-dynamic';

/**
 * Twilio Call Status Webhook
 * Triggered when a call status changes (ringing, completed, no-answer, etc.)
 *
 * Configure this URL in Twilio: /api/webhooks/twilio/call-status
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(formData) as unknown as TwilioCallStatusPayload;

    const { CallSid, CallStatus, From, To, CallDuration } = payload;

    // Only process missed calls (no-answer, busy, failed)
    const missedStatuses = ['no-answer', 'busy', 'failed'];
    if (!missedStatuses.includes(CallStatus)) {
      return NextResponse.json({ status: 'ignored', reason: 'not a missed call' });
    }

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

    // Record the missed call
    const { data: missedCall, error: callError } = await supabase
      .from('missed_calls')
      .insert({
        business_id: business.id,
        caller_phone: From,
        ring_duration: parseInt(CallDuration || '0'),
        call_sid: CallSid,
      })
      .select()
      .single();

    if (callError) {
      console.error('Failed to record missed call:', callError);
      return NextResponse.json({ error: 'Failed to record call' }, { status: 500 });
    }

    // Create a lead and trigger SMS recovery
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        business_id: business.id,
        missed_call_id: missedCall.id,
        caller_phone: From,
        status: 'pending',
      })
      .select()
      .single();

    if (leadError) {
      console.error('Failed to create lead:', leadError);
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
    }

    // Send recovery SMS (async, don't wait)
    sendRecoverySMS(lead.id, business, From).catch((err) => {
      console.error('SMS send failed:', err);
    });

    return NextResponse.json({
      status: 'processed',
      missedCallId: missedCall.id,
      leadId: lead.id,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
