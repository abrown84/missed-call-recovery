/**
 * TCPA / carrier opt-out detection.
 * Contains-keyword match after NFKC + confusable folding + zero-width strip.
 * Shared token list is the source of truth for migration 003 STOP backfill.
 */

import {
  AMBIGUOUS,
  CONFUSABLES,
  OPT_OUT_COMPACT,
  OPT_OUT_CONTAINS_KEYWORDS,
  OPT_OUT_CONTAINS_PHRASES,
  OPT_OUT_EXACT,
  optOutBackfillCompactList,
  optOutBackfillExactList,
} from './opt-out-data';

export type OptOutVerdict =
  | { kind: 'opt_out' }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'not_opt_out' };

export {
  OPT_OUT_EXACT,
  OPT_OUT_COMPACT,
  OPT_OUT_CONTAINS_KEYWORDS,
  OPT_OUT_CONTAINS_PHRASES,
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

/**
 * Canonical normalizer used by inbound webhook AND migration 003 backfill.
 */
export function normalizeOptOutText(raw: string): string {
  return (
    foldConfusables(raw)
      .normalize('NFKC')
      .replace(ZERO_WIDTH_RE, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      // nbsp must become a real space (not deleted) so token boundaries survive
      .replace(/\u00a0/g, ' ')
      // Stryker disable next-line Regex -- /[\r\n]/g ≡ /[\r\n]+/g before \s+ collapse
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
      .replace(/[?!.,…]+$/g, '')
      .replace(/\s+/g, ' ')
      .toUpperCase()
  );
}

/** Spaceless form so 'S T O P' and 'STOP STOP' compact to STOP / STOPSTOP. */
export function compactOptOutText(normalized: string): string {
  return normalized.replace(/[^A-Z0-9]/g, '');
}

/**
 * Classify an inbound body for opt-out.
 * Any message containing a per-se keyword → opt_out (or ambiguous for service talk).
 */
export function classifyOptOut(raw: string): OptOutVerdict {
  const normalized = normalizeOptOutText(raw);
  // Stryker disable next-line ConditionalExpression -- empty ≡ fallthrough to not_opt_out
  if (!normalized) return { kind: 'not_opt_out' };

  for (const token of OPT_OUT_EXACT) {
    if (normalized === token) return { kind: 'opt_out' };
  }

  const compact = compactOptOutText(normalized);
  // Stryker disable next-line ConditionalExpression -- COMPACT ⊂ containsOptOutKeyword
  if (OPT_OUT_COMPACT.has(compact)) return { kind: 'opt_out' };

  // Service talk with STOP → needs human review (never silent not_opt_out)
  if (isServiceTalkWithStop(normalized)) {
    return { kind: 'ambiguous', reason: 'needs_human_review' };
  }

  // Contains per-se keyword / phrase (FCC any reasonable means)
  if (containsOptOutKeyword(normalized, compact)) {
    return { kind: 'opt_out' };
  }

  const cleanedRaw = foldConfusables(raw)
    .normalize('NFKC')
    .replace(ZERO_WIDTH_RE, '')
    .trim();
  for (const re of AMBIGUOUS) {
    // Stryker disable next-line ConditionalExpression,StringLiteral -- STOP already returned via EXACT
    if (re.test(cleanedRaw) && normalized !== 'STOP') {
      return { kind: 'ambiguous', reason: 'needs_human_review' };
    }
  }

  return { kind: 'not_opt_out' };
}

/** True when a per-se keyword or phrase appears in the message. */
export function containsOptOutKeyword(
  normalized: string,
  compact: string = compactOptOutText(normalized)
): boolean {
  for (const phrase of OPT_OUT_CONTAINS_PHRASES) {
    if (normalized.includes(phrase)) return true;
  }
  for (const kw of OPT_OUT_CONTAINS_KEYWORDS) {
    if (kw.includes(' ')) {
      // Spaced stems (OPT OUT) — includes match; do not fall into word-boundary regex.
      if (normalized.includes(kw)) return true;
      continue;
    }
    // Word-boundary style: keyword as whole token
    const re = new RegExp(`(?:^|[^A-Z0-9])${kw}(?:[^A-Z0-9]|$)`);
    if (re.test(normalized)) return true;
    // Compact path requires both stem presence AND length≥3 (END is len 3).
    if (compact.includes(kw) && kw.length >= 3) {
      // Stryker disable next-line ConditionalExpression -- kw∈stems ⇒ regex always matches
      if (/STOP|QUIT|END|CANCEL|REVOKE|UNSUBSCRIBE|OPTOUT/.test(compact)) {
        return true;
      }
    }
  }
  return false;
}

/** True when STOP appears inside service language (not an auto opt-out). */
export function isServiceTalkWithStop(normalized: string): boolean {
  // Stryker disable next-line ConditionalExpression,StringLiteral -- STOP ≡ fallthrough (no service-talk alt matches)
  if (normalized === 'STOP') return false;
  // Stryker disable next-line ConditionalExpression -- no \bSTOP\b ⇒ all alts fail anyway
  if (!/\bSTOP\b/.test(normalized)) return false;
  // Apostrophe-optional contractions must keep both forms (WONT and WON'T).
  return (
    /^(WON'?T|CANT|CAN'T|DOESN'?T|DIDN'?T|NEVER)\b/.test(normalized) ||
    /\bSTOP\s+(BY|IN|AT|THE|LEAKING|DRIPPING|COMING)\b/.test(normalized) ||
    /\b(WON'?T|DOESN'?T)\s+STOP\b/.test(normalized)
  );
}

/** True only for definite auto opt-out. */
export function isDefiniteOptOut(raw: string): boolean {
  return classifyOptOut(raw).kind === 'opt_out';
}

/**
 * Tokens for migration 003 STOP backfill — same list as runtime.
 */
export function optOutBackfillTokens(): string[] {
  const set = new Set<string>([
    ...optOutBackfillExactList(),
    ...optOutBackfillCompactList(),
  ]);
  return [...set];
}

export const OPT_OUT_FOOTER = 'Reply STOP to opt out.';
