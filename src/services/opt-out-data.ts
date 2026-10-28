/**
 * Shared carrier opt-out keyword lists — single source of truth for
 * runtime classifyOptOut AND migration 003 STOP backfill.
 *
 * Policy (pending Alex confirmation; QC r7/r8):
 * - Whole message (after normalize) equals a keyword → auto opt_out.
 * - Keyword as a whole word inside a longer message → ambiguous
 *   (pause + notify + still classify; never silent continue).
 * - Never substring / compact-includes matching.
 *
 * Extending keywords:
 *   1. Add the token to BASE_WHOLE_MESSAGE (and BASE_STEMS if it should
 *      trigger ambiguous mid-sentence).
 *   2. Run tests — compact doubles/repeats are derived automatically.
 *   3. `npm run check:opt-out-sql` regenerates/diffs the SQL IN lists.
 */

/** Core whole-message auto-suppress tokens (normalized uppercase). */
const BASE_WHOLE_MESSAGE = [
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

/** Single-token stems that flag ambiguous when used as a whole word mid-sentence. */
const BASE_WORD_STEMS = [
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

/** Multi-word stems for mid-sentence ambiguous. */
export const OPT_OUT_MULTIWORD_STEMS = ['OPT OUT', 'STOP ALL'] as const;

/**
 * Carrier keywords that customers often double-send ("STOP STOP", "END END").
 * Each gets whole-message + compact entries so repeats behave consistently.
 */
const REPEATABLE_KEYWORDS = [
  'STOP',
  'END',
  'CANCEL',
  'QUIT',
  'UNSUBSCRIBE',
  'REVOKE',
  'OPTOUT',
  'STOPALL',
] as const;

function withRepeats(base: readonly string[]): string[] {
  const out = new Set<string>(base);
  for (const kw of REPEATABLE_KEYWORDS) {
    out.add(`${kw} ${kw}`);
    out.add(`${kw} ${kw} ${kw}`);
  }
  return [...out];
}

/** Exported for tests — skips empty compact forms (all-punctuation tokens). */
export function compactForms(tokens: readonly string[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    const c = t.replace(/[^A-Z0-9]/g, '');
    // Empty compact never matches keyword sets; if(true||c) is killed — keep guard live.
    if (c) out.add(c);
  }
  return [...out];
}

/** Whole-message auto-suppress tokens (normalized uppercase). */
export const OPT_OUT_WHOLE_MESSAGE: readonly string[] = withRepeats(BASE_WHOLE_MESSAGE);

/**
 * Compact (spaceless) whole-message forms.
 * S T O P → STOP, STOP STOP → STOPSTOP, END END → ENDEND.
 */
export const OPT_OUT_WHOLE_MESSAGE_COMPACT: readonly string[] = compactForms(
  OPT_OUT_WHOLE_MESSAGE
);

/**
 * Stems that, as a whole word inside a longer message, flag human review
 * (ambiguous) — never silent auto-suppress.
 */
export const OPT_OUT_WORD_STEMS: readonly string[] = [...BASE_WORD_STEMS];

/** Legacy aliases kept for callers / tests that imported old names. */
export const OPT_OUT_EXACT = OPT_OUT_WHOLE_MESSAGE;
export const OPT_OUT_COMPACT = new Set(OPT_OUT_WHOLE_MESSAGE_COMPACT);

/**
 * Homoglyph / lookalike map — applied AFTER NFKC + toUpperCase (QC r9).
 * Values are uppercase Latin so a single post-upper fold is idempotent.
 * Includes Greek ο/Ο/τ/Τ, Cyrillic У/у, digit 0 → O (St0p).
 */
export const CONFUSABLES: Record<string, string> = {
  // Greek capitals (also uppercased form of lowercase lookalikes)
  '\u0391': 'A', // Α
  '\u0392': 'B', // Β
  '\u0395': 'E', // Ε
  '\u0397': 'H', // Η
  '\u0399': 'I', // Ι
  '\u039A': 'K', // Κ
  '\u039C': 'M', // Μ
  '\u039D': 'N', // Ν
  '\u039F': 'O', // Ο (and NFKC of math-bold 𝚶)
  '\u03A1': 'P', // Ρ
  '\u03A4': 'T', // Τ (upper of τ — sτop)
  '\u03A7': 'X', // Χ
  '\u03A3': 'E', // Σ (approx)
  // Greek lowercase — kept for foldConfusables callers; post-upper path uses capitals
  '\u03BF': 'O', // ο omicron
  '\u03B1': 'A',
  '\u03B5': 'E',
  '\u03C4': 'T', // τ
  // Cyrillic capitals
  '\u0410': 'A', // А
  '\u0412': 'B', // В
  '\u0415': 'E', // Е
  '\u041D': 'H', // Н
  '\u0406': 'I', // І
  '\u04C0': 'I',
  '\u041A': 'K', // К
  '\u041C': 'M', // М
  '\u041E': 'O', // О
  '\u0420': 'P', // Р
  '\u0421': 'C', // С
  '\u0422': 'T', // Т
  '\u0425': 'X', // Х
  '\u0405': 'S', // Ѕ
  '\u0423': 'U', // У → U so QУIT / УNSУBSCRIBE fold
  // Cyrillic lowercase
  '\u0430': 'A',
  '\u0435': 'E',
  '\u043E': 'O',
  '\u0440': 'P',
  '\u0441': 'C',
  '\u0442': 'T',
  '\u0443': 'U',
  '\u0445': 'X',
  '\u0456': 'I',
  '\u0455': 'S',
  // Digit lookalikes
  '0': 'O',
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

/** Confusable source→target pairs for SQL translate() generation. */
export function confusableTranslatePairs(): { from: string; to: string } {
  const from: string[] = [];
  const to: string[] = [];
  for (const [src, dst] of Object.entries(CONFUSABLES)) {
    from.push(src);
    to.push(dst);
  }
  return { from: from.join(''), to: to.join('') };
}
