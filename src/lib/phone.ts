/**
 * Normalize phone numbers to E.164 for suppression / comparison.
 * Default country code 1 (NANP) when a 10-digit number is given.
 */
export function normalizeToE164(
  phone: string,
  defaultCountryCode = '1'
): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    throw new Error('Invalid phone: empty');
  }
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+${defaultCountryCode}${digits}`;
  }
  if (digits.length === 11 && digits.startsWith(defaultCountryCode)) {
    return `+${digits}`;
  }
  // Already includes country code without +
  return `+${digits}`;
}

export function tryNormalizeToE164(
  phone: string,
  defaultCountryCode = '1'
): string | null {
  try {
    return normalizeToE164(phone, defaultCountryCode);
  } catch {
    return null;
  }
}
