/**
 * TCPA / carrier opt-out detection (QC r7/r8).
 *
 * 1. Normalize (NFKC, confusables, zero-width, quote/punct fixpoint, upper).
 * 2. Whole message equals a carrier keyword → opt_out (auto-suppress).
 * 3. Keyword as a whole word inside a longer message → ambiguous
 *    (inbound pauses campaign + notifies owner + still classifies).
 * 4. Never substring / compact-includes matching.
 *
 * Shared token list: opt-out-data.ts (also used by migration 003 backfill).
 */

import {
  CONFUSABLES,
  OPT_OUT_COMPACT,
  OPT_OUT_EXACT,
  OPT_OUT_MULTIWORD_STEMS,
  OPT_OUT_WHOLE_MESSAGE,
  OPT_OUT_WHOLE_MESSAGE_COMPACT,
  OPT_OUT_WORD_STEMS,
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
  OPT_OUT_WHOLE_MESSAGE,
  OPT_OUT_WHOLE_MESSAGE_COMPACT,
  OPT_OUT_WORD_STEMS,
  OPT_OUT_MULTIWORD_STEMS,
};

const ZERO_WIDTH_RE =
  /[\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u3164\uFFA0]/g;

const QUOTE_EDGE_RE = /^["'`“”‘’]+|["'`“”‘’]+$/g;

const WHOLE_MESSAGE_SET = new Set<string>(OPT_OUT_WHOLE_MESSAGE);
const WHOLE_COMPACT_SET = new Set<string>(OPT_OUT_WHOLE_MESSAGE_COMPACT);

/** Replace NBSP with a real space so token boundaries survive collapse. */
export function replaceNbspWithSpace(s: string): string {
  return s.replace(/\u00a0/g, ' ');
}

/** Strip leading/trailing straight + smart quotes (both anchors required). */
export function stripEdgeQuotes(s: string): string {
  return s.replace(QUOTE_EDGE_RE, '');
}

export function foldConfusables(raw: string): string {
  let out = '';
  for (const ch of raw) {
    out += CONFUSABLES[ch] ?? ch;
  }
  return out;
}

/** Quotes + trailing/leading punct stripped together so uncovering is idempotent. */
const EDGE_NOISE_RE = /^[\s?!.,…"'`“”‘’]+|[\s?!.,…"'`“”‘’]+$/g;

/**
 * Canonical normalizer used by inbound webhook AND migration 003 backfill.
 * Loops quote/punct stripping to a fixpoint (QC r8 — no pinned seed).
 */
export function normalizeOptOutText(raw: string): string {
  const folded = foldConfusables(raw)
    .normalize('NFKC')
    .replace(ZERO_WIDTH_RE, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
  const spaced = replaceNbspWithSpace(folded);
  // Stryker disable next-line Regex,MethodExpression: later /\s+/g collapse makes + vs empty quantifier equivalent
  let out = spaced.replace(/[\r\n]+/g, ' ').trim();
  for (let i = 0; i < 8; i++) {
    const next = out
      .replace(EDGE_NOISE_RE, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (next === out) break;
    out = next;
  }
  return out.toUpperCase();
}

/** Spaceless form so 'S T O P' compact to STOP. */
export function compactOptOutText(normalized: string): string {
  return normalized.replace(/[^A-Z0-9]/g, '');
}

/** True when `stem` appears as a whole word/token in normalized text. */
export function hasWholeWordStem(normalized: string, stem: string): boolean {
  if (stem.includes(' ') || stem.includes('-')) {
    const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:[^A-Z0-9]|$)`).test(
      normalized
    );
  }
  return new RegExp(`(?:^|[^A-Z0-9])${stem}(?:[^A-Z0-9]|$)`).test(normalized);
}

/**
 * Classify an inbound body for opt-out.
 * Whole-message keyword → opt_out; keyword inside longer text → ambiguous.
 */
export function classifyOptOut(raw: string): OptOutVerdict {
  const normalized = normalizeOptOutText(raw);
  if (!normalized) return { kind: 'not_opt_out' };

  const compact = compactOptOutText(normalized);

  // Collapse spaced single letters ("S T O P PLEASE" → "STOP PLEASE") then
  // re-check whole-message sets — still whole-message, never substring.
  const collapsed = collapseSpacedLetterTokens(normalized);
  const collapsedCompact = compactOptOutText(collapsed);

  if (
    WHOLE_MESSAGE_SET.has(normalized) ||
    WHOLE_COMPACT_SET.has(compact) ||
    WHOLE_MESSAGE_SET.has(collapsed) ||
    WHOLE_COMPACT_SET.has(collapsedCompact)
  ) {
    return { kind: 'opt_out' };
  }

  // Keyword as a whole word inside a longer message → human review only
  for (const stem of OPT_OUT_WORD_STEMS) {
    if (
      hasWholeWordStem(normalized, stem) ||
      hasWholeWordStem(collapsed, stem)
    ) {
      return { kind: 'ambiguous', reason: 'keyword_in_sentence' };
    }
  }
  for (const stem of OPT_OUT_MULTIWORD_STEMS) {
    if (
      hasWholeWordStem(normalized, stem) ||
      hasWholeWordStem(collapsed, stem)
    ) {
      return { kind: 'ambiguous', reason: 'keyword_in_sentence' };
    }
  }

  return { kind: 'not_opt_out' };
}

/** Join runs of single-letter tokens: "S T O P PLEASE" → "STOP PLEASE". */
export function collapseSpacedLetterTokens(normalized: string): string {
  return normalized.replace(/\b(?:[A-Z]\s+){1,}[A-Z]\b/g, (m) =>
    // Stryker disable next-line Regex: /\s/g vs /\s+/g identical for space runs here
    m.replace(/\s+/g, '')
  );
}

/** True only for definite auto opt-out. */
export function isDefiniteOptOut(raw: string): boolean {
  return classifyOptOut(raw).kind === 'opt_out';
}

/**
 * Tokens for migration 003 STOP backfill — whole-message only (no mid-sentence).
 */
export function optOutBackfillTokens(): string[] {
  const set = new Set<string>([
    ...optOutBackfillExactList(),
    ...optOutBackfillCompactList(),
  ]);
  return [...set];
}

/**
 * Pure predicate mirroring migration 003 whole-message backfill.
 * Used by the parity test so app + SQL share one corpus.
 */
export function wouldBackfillSuppress(raw: string): boolean {
  const normalized = normalizeOptOutText(raw);
  if (!normalized) return false;
  const compact = compactOptOutText(normalized);
  const collapsed = collapseSpacedLetterTokens(normalized);
  const collapsedCompact = compactOptOutText(collapsed);
  return (
    WHOLE_MESSAGE_SET.has(normalized) ||
    WHOLE_COMPACT_SET.has(compact) ||
    WHOLE_MESSAGE_SET.has(collapsed) ||
    WHOLE_COMPACT_SET.has(collapsedCompact)
  );
}

export const OPT_OUT_FOOTER = 'Reply STOP to opt out.';
