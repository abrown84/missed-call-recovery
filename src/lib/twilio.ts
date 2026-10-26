import twilio from 'twilio';
import type { Twilio } from 'twilio';

let cachedClient: Twilio | null = null;

function getAuthToken(): string {
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!token) {
    throw new Error('TWILIO_AUTH_TOKEN is not configured');
  }
  return token;
}

function getAccountSid(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!sid) {
    throw new Error('TWILIO_ACCOUNT_SID is not configured');
  }
  return sid;
}

/** Lazy Twilio client — avoids crashing the build when env vars are absent. */
export function getTwilioClient(): Twilio {
  if (cachedClient) return cachedClient;
  cachedClient = twilio(getAccountSid(), getAuthToken());
  return cachedClient;
}

/** @deprecated Prefer getTwilioClient() — kept for call-site compatibility. */
export const twilioClient = new Proxy({} as Twilio, {
  get(_target, prop, receiver) {
    return Reflect.get(getTwilioClient() as object, prop, receiver);
  },
});

export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  return twilio.validateRequest(getAuthToken(), signature, url, params);
}

export async function sendSMS(to: string, from: string, body: string) {
  const message = await getTwilioClient().messages.create({
    to,
    from,
    body,
  });
  return message;
}
