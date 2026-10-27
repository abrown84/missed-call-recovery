/**
 * Helpers for redacting personally identifiable information in logs.
 */

/** Mask a phone number for logging (keeps last 4 digits). */
export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return '[no-phone]';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  const last4 = digits.slice(-4);
  return `***-***-${last4}`;
}

/** Mask a UUID/id for logging (keeps first 8 chars). */
export function redactId(id: string | null | undefined): string {
  if (!id) return '[no-id]';
  if (id.length <= 8) return '********';
  return `${id.slice(0, 8)}…`;
}
