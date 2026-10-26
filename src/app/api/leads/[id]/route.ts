import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { requireApiUser } from '@/lib/auth-api';
import { getMessagingAdapter } from '@/lib/messaging';
import { redactId, redactPhone } from '@/lib/pii';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum([
    'pending',
    'responded',
    'qualified',
    'escalated',
    'converted',
    'lost',
    'spam',
  ]),
  estimated_value: z.number().finite().min(0).max(1_000_000).optional(),
});

const idSchema = z.string().uuid();

/**
 * PATCH /api/leads/[id] — authenticated
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiUser();
    if (auth.error) return auth.error;

    const { id: rawId } = await params;
    const idParsed = idSchema.safeParse(rawId);
    if (!idParsed.success) {
      return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 });
    }
    const id = idParsed.data;

    const json = await request.json().catch(() => null);
    const body = updateSchema.safeParse(json);
    if (!body.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: body.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*, missed_calls(*)')
      .eq('id', id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', lead.business_id)
      .single();

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      status: body.data.status,
      updated_at: new Date().toISOString(),
    };

    if (body.data.status === 'converted') {
      updates.converted_at = new Date().toISOString();
      if (body.data.estimated_value != null) {
        updates.estimated_value = body.data.estimated_value;
      }
    }

    if (body.data.status === 'escalated') {
      updates.escalated_at = new Date().toISOString();
    }

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select('*, sms_messages(*)')
      .single();

    if (updateError) {
      console.error('Failed to update lead:', updateError.message);
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
    }

    if (body.data.status === 'escalated') {
      try {
        await handleManualEscalation(lead, business);
      } catch (escalationError) {
        console.error(
          'Escalation SMS failed:',
          escalationError instanceof Error ? escalationError.message : 'unknown'
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedLead,
    });
  } catch (error) {
    console.error(
      'Lead update error:',
      error instanceof Error ? error.message : 'unknown'
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleManualEscalation(
  lead: {
    id: string;
    caller_phone: string;
    urgency: string | null;
    issue: string | null;
    sms_response_text: string | null;
  },
  business: {
    phone: string;
    emergency_phone: string | null;
  }
): Promise<void> {
  const escalationPhone = business.emergency_phone || business.phone;

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

  await getMessagingAdapter().sendMessage({
    to: escalationPhone,
    body: message,
    auto: true,
  });

  console.log(
    `Lead ${redactId(lead.id)} manually escalated to ${redactPhone(escalationPhone)}`
  );
}
