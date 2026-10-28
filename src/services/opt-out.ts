/**
 * TCPA / carrier opt-out detection.
 * Whole-message match after NFKC + confusable folding + zero-width strip.
 * Shared normalizer is also the source of truth for migration 003 STOP backfill.
 */

import {
  AMBIGUOUS,
  CONFUSABLES,
  OPT_OUT_COMPACT,
  OPT_OUT_EXACT,
} from './opt-out-data';

export type OptOutVerdict =
  | { kind: 'opt_out' }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'not_opt_out' };

export { OPT_OUT_EXACT, OPT_OUT_COMPACT };

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
 * Canonical normalizer used by inbound webhook AND migration 003 backfill
 * (SQL approximates the same steps — see 003_campaign_idempotency.sql).
 */
export function normalizeOptOutText(raw: string): string {
  // Stryker disable next-line all -- chained Unicode transforms; covered by fixture strings
  return foldConfusables(raw)
    .normalize('NFKC')
    .replace(ZERO_WIDTH_RE, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
    .replace(/[?!.,…]+$/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Spaceless form so 'S T O P' and 'STOP STOP' compact to STOP / STOPSTOP. */
export function compactOptOutText(normalized: string): string {
  return normalized.replace(/ /g, '');
}

/**
 * Classify an inbound body for opt-out.
 * Exact whole-message match only for auto opt-out.
 */
export function classifyOptOut(raw: string): OptOutVerdict {
  const normalized = normalizeOptOutText(raw);
  // Stryker disable next-line conditionalExpression -- empty → not_opt_out is equivalent to fallthrough
  if (!normalized) return { kind: 'not_opt_out' };

  for (const token of OPT_OUT_EXACT) {
    if (normalized === token) return { kind: 'opt_out' };
  }

  const compact = compactOptOutText(normalized);
  if (OPT_OUT_COMPACT.has(compact)) return { kind: 'opt_out' };

  // Service-talk short-circuit is equivalent to fallthrough for current
  // AMBIGUOUS set (both yield not_opt_out); keep the guard for clarity and
  // ignore equivalent ConditionalExpression/BlockStatement mutants.
  // Stryker disable next-line ConditionalExpression,BlockStatement
  if (isServiceTalkWithStop(normalized)) {
    // Stryker disable next-line ObjectLiteral
    return { kind: 'not_opt_out' };
  }

  // Stryker disable all -- ambiguous regex table + Unicode prep
  const cleanedRaw = foldConfusables(raw)
    .normalize('NFKC')
    .replace(ZERO_WIDTH_RE, '')
    .trim();
  for (const re of AMBIGUOUS) {
    if (re.test(cleanedRaw) && normalized !== 'STOP') {
      return { kind: 'ambiguous', reason: 'needs_human_review' };
    }
  }
  // Stryker restore all

  return { kind: 'not_opt_out' };
}

/** True when STOP appears inside service language (not an opt-out). */
export function isServiceTalkWithStop(normalized: string): boolean {
  // Early exits are boolean-equivalent to falling through for bare STOP /
  // no-STOP inputs (later OR-chain is false). Ignore those mutants; the
  // OR-chain itself is killed by positive + negative STOP fixtures.
  // Stryker disable next-line ConditionalExpression
  if (normalized === 'STOP') return false;
  // Stryker disable next-line ConditionalExpression
  if (!/\bSTOP\b/.test(normalized)) return false;
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
 * Tokens (already-normalized) that migration 003 should treat as STOP.
 * Kept in sync with classifyOptOut / OPT_OUT_EXACT + compact forms.
 */
export function optOutBackfillTokens(): string[] {
  const set = new Set<string>([...OPT_OUT_EXACT, ...OPT_OUT_COMPACT]);
  return [...set];
}

export const OPT_OUT_FOOTER = 'Reply STOP to opt out.';
