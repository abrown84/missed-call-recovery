// @ts-nocheck
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Timing-safe Bearer check for BRWN device / relay → this app webhooks.
 * Expects Authorization: Bearer $BRWN_WEBHOOK_SECRET
 */
export function authorizeBrwnWebhook(request: NextRequest): NextResponse | null {
  const secret = process.env.BRWN_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('BRWN_WEBHOOK_SECRET is not configured; rejecting webhook');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;

  try {
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/** Pure helper for unit tests — returns true when Authorization matches the secret. */
export function bearerMatches(authorization: string | null | undefined, secret: string): boolean {
  if (!authorization || !secret) return false;
  const expected = `Bearer ${secret}`;
  try {
    const a = Buffer.from(authorization);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
