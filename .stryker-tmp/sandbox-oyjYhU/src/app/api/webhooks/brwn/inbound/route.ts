// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeBrwnWebhook } from '@/lib/messaging';
import {
  InboundError,
  processInboundSms,
  resolveBusinessPhone,
} from '@/services/inbound';

export const dynamic = 'force-dynamic';

/**
 * Inbound payload from the BRWN relay webhook (see relay fire_webhook).
 * Debounced batches may include `messages` + `count`; we use the latest body.
 * `to` / `businessPhone` may be absent on stock relay webhooks — fall back to
 * BRWN_DEFAULT_BUSINESS_PHONE.
 */
const bodySchema = z.object({
  from: z.string().min(3).max(40),
  body: z.string().max(4000).default(''),
  to: z.string().min(3).max(32).optional(),
  businessPhone: z.string().min(3).max(32).optional(),
  received_at: z.number().optional(),
  ts: z.number().optional(),
  count: z.number().optional(),
  messages: z
    .array(
      z.object({
        from: z.string().optional(),
        body: z.string().optional(),
        received_at: z.number().optional(),
        ts: z.number().optional(),
      })
    )
    .optional(),
  messageId: z.string().max(128).optional(),
});

/**
 * Authorization: Bearer $BRWN_WEBHOOK_SECRET
 * Configure on the relay via set_webhook.sh:
 *   WEBHOOK_URL=https://YOUR-APP/api/webhooks/brwn/inbound
 *   WEBHOOK_AUTH=Bearer <same as BRWN_WEBHOOK_SECRET>
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

    const businessPhone = resolveBusinessPhone(
      parsed.data.businessPhone || parsed.data.to
    );
    if (!businessPhone) {
      return NextResponse.json(
        {
          error:
            'businessPhone/to missing and BRWN_DEFAULT_BUSINESS_PHONE is not set',
        },
        { status: 400 }
      );
    }

    // Prefer the latest body in a debounced batch
    const batch = parsed.data.messages;
    const latest =
      batch && batch.length > 0 ? batch[batch.length - 1] : undefined;
    const from = latest?.from || parsed.data.from;
    const body = latest?.body ?? parsed.data.body;

    const result = await processInboundSms({
      from,
      body,
      businessPhone,
      messageId: parsed.data.messageId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InboundError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(
      'Inbound webhook error:',
      error instanceof Error ? error.message : 'unknown'
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
