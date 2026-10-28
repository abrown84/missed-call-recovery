import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Normalize phone numbers to E.164 via libphonenumber-js.
 * - Strips extensions (;ext=, x, ext.)
 * - Converts 00-international prefix to +
 * - Rejects too-short / invalid numbers (returns null via tryNormalize)
 */

const EXT_RE = /(?:\s*(?:;?ext\.?|extension|x)\s*[:.]?\s*\d+)\s*$/i;

export function stripExtension(raw: string): string {
  return raw.trim().replace(EXT_RE, '').trim();
}

/**
 * Convert leading 00 to + (international dialing prefix).
 * 0015551234567 → +15551234567 (not +001…)
 */
export function normalizeInternationalPrefix(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('00')) return `+${t.slice(2)}`;
  return t;
}

export function normalizeToE164(
  phone: string,
  defaultCountry: CountryCode = 'US'
): string {
  const cleaned = normalizeInternationalPrefix(stripExtension(phone));
  if (!cleaned || !/\d/.test(cleaned)) {
    throw new Error('Invalid phone: no digits');
  }
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  // Accept isPossible() so reserved 555 fixtures / staging numbers still
  // normalize; still rejects too-short locals (e.g. 555-1234).
  if (!parsed || (!parsed.isValid() && !parsed.isPossible())) {
    throw new Error(`Invalid phone: ${phone}`);
  }
  const e164 = parsed.format('E.164');
  // Guard: refuse numbers that still look like truncated local (no country + <10 national).
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 11 && defaultCountry === 'US') {
    throw new Error(`Invalid phone: ${phone}`);
  }
  return e164;
}

export function tryNormalizeToE164(
  phone: string,
  defaultCountry: CountryCode = 'US'
): string | null {
  try {
    return normalizeToE164(phone, defaultCountry);
  } catch {
    return null;
  }
}

/** Digits-only length check used in tests / pre-validation. */
export function digitCount(phone: string): number {
  return phone.replace(/\D/g, '').length;
}
