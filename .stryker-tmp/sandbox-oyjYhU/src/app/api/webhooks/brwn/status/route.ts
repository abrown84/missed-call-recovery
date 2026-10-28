// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { authorizeBrwnWebhook } from '@/lib/messaging';
import { redactId } from '@/lib/pii';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  messageId: z.string().min(1).max(128),
  status: z.enum(['queued', 'dispatched', 'sent', 'delivered', 'failed']),
  error: z.string().max(500).optional().nullable(),
});

/**
 * Authenticated delivery-status update (device or relay forwarder).
 * Updates sms_messages by message_sid (= BRWN relay message id).
 *
 * Authorization: Bearer $BRWN_WEBHOOK_SECRET
 */
export async function POST(request: NextRequest) {
  const denied = authorizeBrwnWebhook(request);
  if (denied) return denied;

  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('sms_messages')
      .update({ status: parsed.data.status })
      .eq('message_sid', parsed.data.messageId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to update SMS status:', error.message);
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ status: 'not_found' }, { status: 404 });
    }

    if (parsed.data.status === 'failed' && parsed.data.error) {
      console.error(
        `Message ${redactId(parsed.data.messageId)} failed: ${parsed.data.error.slice(0, 120)}`
      );
    }

    return NextResponse.json({ status: 'updated', id: data.id });
  } catch (error) {
    console.error(
      'Status webhook error:',
      error instanceof Error ? error.message : 'unknown'
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
