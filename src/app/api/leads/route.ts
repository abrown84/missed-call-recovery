import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { requireApiUser } from '@/lib/auth-api';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  businessId: z.string().uuid().optional(),
  status: z
    .enum(['pending', 'responded', 'qualified', 'escalated', 'converted', 'lost', 'spam'])
    .optional(),
  urgency: z.enum(['emergency', 'high', 'normal', 'low']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

/**
 * GET /api/leads — authenticated
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    businessId: searchParams.get('businessId') || undefined,
    status: searchParams.get('status') || undefined,
    urgency: searchParams.get('urgency') || undefined,
    limit: searchParams.get('limit') || undefined,
    offset: searchParams.get('offset') || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { businessId, status, urgency, limit, offset } = parsed.data;
  const supabase = createServerClient();

  let query = supabase
    .from('leads')
    .select('*, missed_calls(*), sms_messages(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (businessId) {
    query = query.eq('business_id', businessId);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (urgency) {
    query = query.eq('urgency', urgency);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data,
    pagination: {
      total: count,
      limit,
      offset,
    },
  });
}
