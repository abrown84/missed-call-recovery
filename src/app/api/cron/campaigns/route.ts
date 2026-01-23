import { NextRequest, NextResponse } from 'next/server';
import { processDueCampaigns } from '@/services/campaigns';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron Endpoint - Campaign Processor
 * Runs daily to send scheduled campaign messages
 *
 * Configure in vercel.json:
 * { "crons": [{ "path": "/api/cron/campaigns", "schedule": "0 9 * * *" }] }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (optional but recommended)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting campaign processor...');

    const result = await processDueCampaigns();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Allow POST as well for manual testing
export async function POST(request: NextRequest) {
  return GET(request);
}
