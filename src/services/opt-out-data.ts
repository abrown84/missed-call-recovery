/**
 * Opt-out token / confusable tables — single shared list for runtime + 003 backfill.
 * Per-se FCC keywords: stop, quit, end, revoke, opt out, cancel, unsubscribe.
 */

/** Exact whole-message matches (after normalize). */
export const OPT_OUT_EXACT = [
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
  'CANCEL PLEASE',
  'LEAVE ME ALONE',
  'TAKE ME OFF YOUR LIST',
  'TAKE ME OFF THE LIST',
  'DONT TEXT ME',
  "DON'T TEXT ME",
] as const;

/** Spaceless compact forms (S T O P → STOP, STOP STOP → STOPSTOP). */
export const OPT_OUT_COMPACT = new Set([
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
]);

/**
 * Per-se keyword stems — if the normalized message CONTAINS one as a word
 * (or compact contains the stem), treat as opt-out (FCC "any reasonable means").
 */
export const OPT_OUT_CONTAINS_KEYWORDS = [
  'STOP',
  'QUIT',
  'END',
  'REVOKE',
  'CANCEL',
  'UNSUBSCRIBE',
  'OPTOUT',
  'OPT OUT',
  'OPT-OUT',
] as const;

/** Phrase contains-matches (normalized uppercase). */
export const OPT_OUT_CONTAINS_PHRASES = [
  'STOP TEXTING',
  'STOP SENDING',
  'STOP ALL',
  'TAKE ME OFF',
  'DO NOT CONTACT',
  'DONT CONTACT',
  "DON'T CONTACT",
  'DO NOT TEXT',
  'DONT TEXT',
  "DON'T TEXT",
  'REMOVE ME FROM',
  'OFF YOUR LIST',
] as const;

/** Service-talk → ambiguous (needs review), never silent not_opt_out. */
export const AMBIGUOUS = [
  /^no\s+more\s+(texts?|messages?)/i,
  /^remove\s+me\b/i,
  /^wrong\s+number$/i,
];

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

/** Shared list for SQL backfill IN (...). */
export function optOutBackfillExactList(): string[] {
  return [...OPT_OUT_EXACT];
}

export function optOutBackfillCompactList(): string[] {
  return [...OPT_OUT_COMPACT];
}
