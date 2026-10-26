import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { validateTwilioWebhook } from '@/lib/twilio-webhook';
import { redactPhone } from '@/lib/pii';
import { sendRecoverySMS } from '@/services/sms';
import { enrollLeadInCampaign } from '@/services/campaigns';

export const dynamic = 'force-dynamic';

const MISSED_STATUSES = new Set(['no-answer', 'busy', 'failed']);

/**
 * Twilio Call Status Webhook
 * Configure: /api/webhooks/twilio/call-status
 */
export async function POST(request: NextRequest) {
  try {
    const params = await validateTwilioWebhook(request);
    if (!params) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const CallSid = params.CallSid;
    const CallStatus = params.CallStatus;
    const From = params.From;
    const To = params.To;
    const CallDuration = params.CallDuration;

    if (!CallSid || !CallStatus || !From || !To) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!MISSED_STATUSES.has(CallStatus)) {
      return NextResponse.json({ status: 'ignored', reason: 'not a missed call' });
    }

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

    const { data: missedCall, error: callError } = await supabase
      .from('missed_calls')
      .insert({
        business_id: business.id,
        caller_phone: From,
        ring_duration: parseInt(CallDuration || '0', 10) || 0,
        call_sid: CallSid,
      })
      .select()
      .single();

    if (callError) {
      console.error('Failed to record missed call:', callError.message);
      return NextResponse.json({ error: 'Failed to record call' }, { status: 500 });
    }

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
      console.error('Failed to create lead:', leadError.message);
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
    }

    sendRecoverySMS(lead.id, business, From).catch((err) => {
      console.error('SMS send failed:', err instanceof Error ? err.message : 'unknown');
    });

    enrollLeadInCampaign(lead.id).catch((err) => {
      console.error(
        'Campaign enrollment failed:',
        err instanceof Error ? err.message : 'unknown'
      );
    });

    return NextResponse.json({
      status: 'processed',
      missedCallId: missedCall.id,
      leadId: lead.id,
    });
  } catch (error) {
    console.error('Webhook error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
