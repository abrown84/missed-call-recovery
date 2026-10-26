import { NextRequest, NextResponse } from 'next/server';
import { processDueCampaigns } from '@/services/campaigns';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

function authorizeCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.error('CRON_SECRET is not configured; rejecting cron request');
    return false;
  }

  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${cronSecret}`;

  try {
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Vercel Cron Endpoint - Campaign Processor
 * Requires Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: NextRequest) {
  try {
    if (!authorizeCron(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await processDueCampaigns();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error(
      'Cron job error:',
      error instanceof Error ? error.message : 'unknown'
    );
    return NextResponse.json(
      {
        success: false,
        error: 'Campaign processor failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
