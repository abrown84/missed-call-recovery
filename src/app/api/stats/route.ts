import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// Force dynamic rendering (no static generation)
export const dynamic = 'force-dynamic';

/**
 * GET /api/stats
 * Fetch dashboard statistics for a business
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get('businessId');
  const period = searchParams.get('period') || 'week'; // day, week, month

  if (!businessId) {
    return NextResponse.json({ error: 'businessId required' }, { status: 400 });
  }

  const supabase = createServerClient();

  // Calculate date range
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

  // Fetch missed calls count
  const { count: missedCalls } = await supabase
    .from('missed_calls')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', startDateStr);

  // Fetch leads with status breakdown
  const { data: leads } = await supabase
    .from('leads')
    .select('status, urgency, estimated_value')
    .eq('business_id', businessId)
    .gte('created_at', startDateStr);

  // Fetch SMS messages sent
  const { count: smsDelivered } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .gte('sent_at', startDateStr);

  // Calculate stats
  type LeadRow = { status: string; urgency: string | null; estimated_value: number | null };
  const leadsArray: LeadRow[] = leads || [];
  const responses = leadsArray.filter((l) => l.status !== 'pending').length;
  const emergencies = leadsArray.filter((l) => l.urgency === 'emergency').length;
  const recoveredLeads = leadsArray.filter(
    (l) => l.status === 'converted' || l.status === 'escalated'
  ).length;
  const estimatedRevenue = leadsArray
    .filter((l) => l.status === 'converted')
    .reduce((sum, l) => sum + (l.estimated_value || 350), 0); // Default $350 per job

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
