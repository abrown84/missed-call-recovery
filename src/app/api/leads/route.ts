import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * GET /api/leads
 * Fetch leads with optional filtering
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get('businessId');
  const status = searchParams.get('status');
  const urgency = searchParams.get('urgency');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
