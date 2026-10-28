/**
 * TCPA / carrier opt-out detection.
 * Whole-message match after NFKC + confusable folding + zero-width strip.
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
  'STOP IT',
  'UNSUBSCRIBE ME',
  'CANCEL PLEASE',
  'LEAVE ME ALONE',
  'STOP TEXTING ME',
  'STOP MESSAGING ME',
] as const;

/** Ambiguous phrases → human review (do not auto-suppress). */
const AMBIGUOUS = [
  /^stop\s+(texting|messaging|sms)\b/i,
  /^no\s+more\s+(texts?|messages?)/i,
  /^remove\s+me\b/i,
  /^wrong\s+number$/i,
  /^please\s+unsubscribe\b/i,
];

/** Greek/Cyrillic look-alikes → Latin (confusable folding). */
const CONFUSABLES: Record<string, string> = {
  '\u0391': 'A', // Greek Alpha
  '\u0410': 'A', // Cyrillic A
  '\u0392': 'B',
  '\u0412': 'B',
  '\u0395': 'E',
  '\u0415': 'E',
  '\u0397': 'H',
  '\u041D': 'H',
  '\u0399': 'I',
  '\u0406': 'I',
  '\u04C0': 'I',
  '\u039A': 'K',
  '\u041A': 'K',
  '\u039C': 'M',
  '\u041C': 'M',
  '\u039D': 'N',
  '\u041E': 'O',
  '\u039F': 'O',
  '\u0420': 'P',
  '\u03A1': 'P',
  '\u0421': 'C',
  '\u03A3': 'E', // rough
  '\u0422': 'T',
  '\u03A4': 'T',
  '\u0425': 'X',
  '\u03A7': 'X',
  '\u0430': 'a',
  '\u0435': 'e',
  '\u043E': 'o',
  '\u0440': 'p',
  '\u0441': 'c',
  '\u0443': 'y',
  '\u0445': 'x',
  '\u0456': 'i',
  // Fullwidth already handled by NFKC; keep common stop confusables
  '\u0405': 'S', // Cyrillic S
  '\u0455': 's',
};

const ZERO_WIDTH_RE =
  /[\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u3164\uFFA0]/g;

export function foldConfusables(raw: string): string {
  let out = '';
  for (const ch of raw) {
    out += CONFUSABLES[ch] ?? ch;
  }
  return out;
}

export function normalizeOptOutText(raw: string): string {
  return foldConfusables(raw)
    .normalize('NFKC')
    .replace(ZERO_WIDTH_RE, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '') // emoji e.g. 🛑
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
    .replace(/[?!.,…]+$/g, '')
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

  // Single-word STOP-family already covered; reject embedded STOP in service talk.
  if (/\bSTOP\b/.test(normalized) && normalized !== 'STOP') {
    if (
      /^(WON'?T|CANT|CAN'T|DOESN'?T|DIDN'?T|NEVER)\b/.test(normalized) ||
      /\bSTOP\s+(BY|IN|AT|THE|LEAKING|DRIPPING|COMING)\b/.test(normalized) ||
      /\b(WON'?T|DOESN'?T)\s+STOP\b/.test(normalized)
    ) {
      return { kind: 'not_opt_out' };
    }
  }

  const cleanedRaw = foldConfusables(raw)
    .normalize('NFKC')
    .replace(ZERO_WIDTH_RE, '')
    .trim();
  for (const re of AMBIGUOUS) {
    if (re.test(cleanedRaw) && normalized !== 'STOP') {
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
