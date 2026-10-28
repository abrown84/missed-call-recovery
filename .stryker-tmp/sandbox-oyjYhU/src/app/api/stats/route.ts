// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { requireApiUser } from '@/lib/auth-api';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  businessId: z.string().uuid(),
  period: z.enum(['day', 'week', 'month']).default('week'),
});

/**
 * GET /api/stats — authenticated
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    businessId: searchParams.get('businessId') || undefined,
    period: searchParams.get('period') || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { businessId, period } = parsed.data;
  const supabase = createServerClient();

  const now = new Date();
  let startDate: Date;
  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'week':
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  const startDateStr = startDate.toISOString();

  const { count: missedCalls } = await supabase
    .from('missed_calls')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', startDateStr);

  const { data: leads } = await supabase
    .from('leads')
    .select('status, urgency, estimated_value')
    .eq('business_id', businessId)
    .gte('created_at', startDateStr);

  const { count: smsDelivered } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .gte('sent_at', startDateStr);

  type LeadRow = { status: string; urgency: string | null; estimated_value: number | null };
  const leadsArray: LeadRow[] = leads || [];
  const responses = leadsArray.filter((l) => l.status !== 'pending').length;
  const emergencies = leadsArray.filter((l) => l.urgency === 'emergency').length;
  const recoveredLeads = leadsArray.filter(
    (l) => l.status === 'converted' || l.status === 'escalated'
  ).length;
  const estimatedRevenue = leadsArray
    .filter((l) => l.status === 'converted')
    .reduce((sum, l) => sum + (l.estimated_value || 350), 0);

  const responseRate =
    missedCalls && missedCalls > 0 ? Math.round((responses / missedCalls) * 100) : 0;

  return NextResponse.json({
    success: true,
    data: {
      period,
      missedCalls: missedCalls || 0,
      smsDelivered: smsDelivered || 0,
      responses,
      responseRate,
      emergencies,
      recoveredLeads,
      estimatedRevenue,
    },
  });
}
