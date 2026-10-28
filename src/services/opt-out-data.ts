/**
 * Shared carrier opt-out keyword lists — single source of truth for
 * runtime classifyOptOut AND migration 003 STOP backfill.
 *
 * Policy (QC r7):
 * - Whole message (after normalize) equals a keyword → auto opt_out.
 * - Keyword as a whole word inside a longer message → ambiguous (human review).
 * - Never substring / compact-includes matching.
 */

/** Whole-message auto-suppress tokens (normalized uppercase). */
export const OPT_OUT_WHOLE_MESSAGE = [
  'STOP',
  'STOPALL',
  'STOP ALL',
  'STOP STOP',
  'STOP STOP STOP',
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
  'DO NOT CONTACT ME',
  'DONT CONTACT ME',
  "DON'T CONTACT ME",
  'PLEASE STOP',
  'STOP PLEASE',
  'STOP IT',
  'STOP PLS',
  'STOP TEXTING',
  'STOP TEXTING ME',
  'STOP MESSAGING ME',
  'STOP SENDING',
  'STOP ALL TEXTS',
  'PLEASE STOP TEXTING ME',
  'UNSUBSCRIBE ME',
  'UNSUBSCRIBE ME PLEASE',
  'PLEASE UNSUBSCRIBE ME',
  'CANCEL PLEASE',
  'LEAVE ME ALONE',
  'TAKE ME OFF YOUR LIST',
  'TAKE ME OFF THE LIST',
  'DONT TEXT ME',
  "DON'T TEXT ME",
] as const;

/**
 * Compact (spaceless) whole-message forms.
 * S T O P → STOP, STOP STOP → STOPSTOP.
 */
export const OPT_OUT_WHOLE_MESSAGE_COMPACT = [
  'STOP',
  'STOPALL',
  'STOPSTOP',
  'STOPSTOPSTOP',
  'UNSUBSCRIBE',
  'QUIT',
  'END',
  'CANCEL',
  'OPTOUT',
  'REVOKE',
] as const;

/**
 * Stems that, as a whole word inside a longer message, flag human review
 * (ambiguous) — never silent auto-suppress.
 */
export const OPT_OUT_WORD_STEMS = [
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'QUIT',
  'END',
  'CANCEL',
  'REVOKE',
  'OPTOUT',
  'OPT-OUT',
] as const;

/** Multi-word stems checked with word-boundary style on normalized text. */
export const OPT_OUT_MULTIWORD_STEMS = ['OPT OUT', 'STOP ALL'] as const;

/** Legacy aliases kept for callers / tests that imported old names. */
export const OPT_OUT_EXACT = OPT_OUT_WHOLE_MESSAGE;
export const OPT_OUT_COMPACT = new Set(OPT_OUT_WHOLE_MESSAGE_COMPACT);

export const CONFUSABLES: Record<string, string> = {
  '\u0391': 'A',
  '\u0410': 'A',
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
  '\u03A3': 'E',
  '\u0422': 'T',
  '\u03A4': 'T',
  '\u0425': 'X',
  '\u03A7': 'X',
  '\u0430': 'a',
  '\u0435': 'e',
  '\u043E': 'o',
  '\u0440': 'p',
  '\u0441': 'c',
  '\u0442': 't',
  '\u0443': 'y',
  '\u0445': 'x',
  '\u0456': 'i',
  '\u0405': 'S',
  '\u0455': 's',
};

/** Exact list for SQL `IN (...)` — same tokens as OPT_OUT_WHOLE_MESSAGE. */
export function optOutBackfillExactList(): string[] {
  return [...OPT_OUT_WHOLE_MESSAGE];
}

/** Compact list for SQL spaceless `IN (...)`. */
export function optOutBackfillCompactList(): string[] {
  return [...OPT_OUT_WHOLE_MESSAGE_COMPACT];
}

/** SQL-escaped single-quoted literals for embedding in migrations. */
export function sqlQuotedList(tokens: readonly string[]): string {
  return tokens
    .map((t) => `'${t.replace(/'/g, "''")}'`)
    .join(', ');
}
