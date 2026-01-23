import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;

export const twilioClient = twilio(accountSid, authToken);

// Validate Twilio webhook signatures
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  return twilio.validateRequest(authToken, signature, url, params);
}

// Send SMS
export async function sendSMS(to: string, from: string, body: string) {
  const message = await twilioClient.messages.create({
    to,
    from,
    body,
  });
  return message;
}
