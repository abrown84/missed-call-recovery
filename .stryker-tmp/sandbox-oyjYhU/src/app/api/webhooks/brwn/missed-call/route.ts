// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeBrwnWebhook } from '@/lib/messaging';
import { MissedCallError, processMissedCall } from '@/services/missed-call';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  callerPhone: z.string().min(3).max(32),
  businessPhone: z.string().min(3).max(32),
  callId: z.string().min(1).max(128),
  ringDurationSeconds: z.number().int().min(0).max(3600).optional(),
  // Aliases some device clients may send
  from: z.string().min(3).max(32).optional(),
  to: z.string().min(3).max(32).optional(),
});

/**
 * Authenticated missed-call event from the BRWN device (Android today).
 * The phone detects the unanswered call and POSTs here; this app queues the text-back
 * through the BRWN relay (sender token → /api/messages).
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

    const callerPhone = parsed.data.callerPhone || parsed.data.from;
    const businessPhone = parsed.data.businessPhone || parsed.data.to;
    if (!callerPhone || !businessPhone) {
      return NextResponse.json(
        { error: 'callerPhone and businessPhone are required' },
        { status: 400 }
      );
    }

    const result = await processMissedCall({
      callerPhone,
      businessPhone,
      callId: parsed.data.callId,
      ringDurationSeconds: parsed.data.ringDurationSeconds,
    });

    return NextResponse.json({ status: 'processed', ...result });
  } catch (error) {
    if (error instanceof MissedCallError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(
      'Missed-call webhook error:',
      error instanceof Error ? error.message : 'unknown'
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
