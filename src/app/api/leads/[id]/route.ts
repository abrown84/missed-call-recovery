import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendSMS } from '@/lib/twilio';

export const dynamic = 'force-dynamic';

interface UpdateLeadRequest {
  status?: 'pending' | 'responded' | 'qualified' | 'escalated' | 'converted' | 'lost' | 'spam';
  estimated_value?: number;
}

/**
 * PATCH /api/leads/[id]
 * Update lead status and trigger related actions
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = (await request.json()) as UpdateLeadRequest;

    if (!body.status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Fetch the lead and business details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*, missed_calls(*)')
      .eq('id', id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Fetch business details for escalation
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', lead.business_id)
      .single();

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Prepare update payload
    const updates: Record<string, any> = {
      status: body.status,
      updated_at: new Date().toISOString(),
    };

    // Set timestamps based on status
    if (body.status === 'converted') {
      updates.converted_at = new Date().toISOString();
      if (body.estimated_value) {
        updates.estimated_value = body.estimated_value;
      }
    }

    if (body.status === 'escalated') {
      updates.escalated_at = new Date().toISOString();
    }

    // Update the lead
    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select('*, sms_messages(*)')
      .single();

    if (updateError) {
      console.error('Failed to update lead:', updateError);
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
    }

    // Handle escalation - send SMS to business owner
    if (body.status === 'escalated') {
      try {
        await handleManualEscalation(lead, business);
      } catch (escalationError) {
        console.error('Escalation SMS failed:', escalationError);
        // Don't fail the request if SMS fails, lead is already updated
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedLead,
    });
  } catch (error) {
    console.error('Lead update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Handle manual escalation triggered from dashboard
 */
async function handleManualEscalation(lead: any, business: any): Promise<void> {
  const escalationPhone = business.emergency_phone || business.phone;

  // Build escalation message
  const urgencyEmoji = lead.urgency === 'emergency' ? '🚨' : '⚠️';
  const message = [
    `${urgencyEmoji} MANUAL ESCALATION`,
    `Phone: ${lead.caller_phone}`,
    lead.issue ? `Issue: ${lead.issue}` : 'Issue: Not specified',
    lead.sms_response_text
      ? `Response: "${lead.sms_response_text.slice(0, 100)}"`
      : 'No response yet',
    `Escalated by user - call back ASAP!`,
  ].join('\n');

  // Send escalation SMS
  await sendSMS(escalationPhone, business.phone, message);

  console.log(`Lead ${lead.id} manually escalated to ${escalationPhone}`);
}
