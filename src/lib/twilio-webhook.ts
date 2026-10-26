import { NextRequest } from 'next/server';
import twilio from 'twilio';

/**
 * Validate a Twilio webhook request using X-Twilio-Signature.
 * Returns parsed form params on success, or null if invalid / missing auth.
 */
export async function validateTwilioWebhook(
  request: NextRequest
): Promise<Record<string, string> | null> {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) {
    console.error('TWILIO_AUTH_TOKEN is not configured; rejecting webhook');
    return null;
  }

  const signature = request.headers.get('x-twilio-signature');
  if (!signature) {
    return null;
  }

  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = typeof value === 'string' ? value : value.name;
  });

  // Prefer the public app URL so signature validation matches what Twilio signed.
  const configuredBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
  const url = configuredBase
    ? `${configuredBase}${request.nextUrl.pathname}`
    : request.url;

  const valid = twilio.validateRequest(authToken, signature, url, params);
  if (!valid) {
    return null;
  }

  return params;
}
