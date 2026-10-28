/**
 * TCPA / carrier opt-out detection.
 * Whole-message match after NFKC normalization — avoids false positives like
 * "won't stop leaking" or "stop by today".
 */

export type OptOutVerdict =
  | { kind: 'opt_out' }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'not_opt_out' };

/** Exact whole-message tokens (case-insensitive after normalize). */
export const OPT_OUT_EXACT = [
  'STOP',
  'STOPALL',
  'STOP ALL',
  'UNSUBSCRIBE',
  'QUIT',
  'END',
  'CANCEL',
  'OPTOUT',
  'OPT OUT',
  'OPT-OUT',
  'REVOKE',
  "DON'T TEXT ME AGAIN",
  'DONT TEXT ME AGAIN',
  'DO NOT TEXT ME AGAIN',
  'PLEASE STOP',
  'STOP PLEASE',
] as const;

/** Ambiguous phrases → human review (do not auto-suppress). */
const AMBIGUOUS = [
  /^stop\s+(texting|messaging|sms)/i,
  /^no\s+more\s+(texts?|messages?)/i,
  /^remove\s+me\b/i,
  /^wrong\s+number$/i,
];

export function normalizeOptOutText(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/[!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Classify an inbound body for opt-out.
 * Exact whole-message match only for auto opt-out.
 */
export function classifyOptOut(raw: string): OptOutVerdict {
  const normalized = normalizeOptOutText(raw);
  if (!normalized) return { kind: 'not_opt_out' };

  for (const token of OPT_OUT_EXACT) {
    if (normalized === token) return { kind: 'opt_out' };
  }

  // Single-word STOP-family already covered; reject embedded STOP.
  if (/\bSTOP\b/.test(normalized) && normalized !== 'STOP') {
    // "STOP LEAKING" / "WON'T STOP" are not opt-outs
    if (
      /^(WON'?T|CANT|CAN'T|DOESN'?T|DIDN'?T|NEVER)\b/.test(normalized) ||
      /\bSTOP\s+(BY|IN|AT|THE|LEAKING|DRIPPING|COMING)\b/.test(normalized) ||
      /\b(WON'?T|DOESN'?T)\s+STOP\b/.test(normalized)
    ) {
      return { kind: 'not_opt_out' };
    }
  }

  const trimmed = raw.normalize('NFKC').trim();
  for (const re of AMBIGUOUS) {
    if (re.test(trimmed) && normalizeOptOutText(trimmed) !== 'STOP') {
      return { kind: 'ambiguous', reason: 'needs_human_review' };
    }
  }

  return { kind: 'not_opt_out' };
}

/** True only for definite auto opt-out. */
export function isDefiniteOptOut(raw: string): boolean {
  return classifyOptOut(raw).kind === 'opt_out';
}

export const OPT_OUT_FOOTER = 'Reply STOP to opt out.';
