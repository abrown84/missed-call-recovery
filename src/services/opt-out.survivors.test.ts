/**
 * Behavioural tests targeting Stryker survivors on opt-out.ts / opt-out-data.ts (QC r7).
 */
import { describe, expect, it } from 'vitest';
import {
  classifyOptOut,
  collapseSpacedLetterTokens,
  compactOptOutText,
  hasWholeWordStem,
  isDefiniteOptOut,
  normalizeOptOutText,
  wouldBackfillSuppress,
} from './opt-out';
import {
  OPT_OUT_MULTIWORD_STEMS,
  OPT_OUT_WHOLE_MESSAGE,
  OPT_OUT_WHOLE_MESSAGE_COMPACT,
  OPT_OUT_WORD_STEMS,
  optOutBackfillCompactList,
  optOutBackfillExactList,
  sqlQuotedList,
} from './opt-out-data';

describe('normalizeOptOutText trailing-punctuation anchor (L75)', () => {
  it('keeps mid-message punctuation (only strips trailing ?!.,…)', () => {
    expect(normalizeOptOutText('STOP, PLEASE')).toBe('STOP, PLEASE');
    expect(normalizeOptOutText('HELLO,WORLD')).toBe('HELLO,WORLD');
  });

  it('comma-only STOP, PLEASE compact-matches STOP PLEASE → opt_out', () => {
    // Compact strips the comma → STOPPLEASE ≡ whole-message STOP PLEASE.
    expect(normalizeOptOutText('STOP, PLEASE')).toBe('STOP, PLEASE');
    expect(classifyOptOut('STOP, PLEASE').kind).toBe('opt_out');
    expect(isDefiniteOptOut('STOP, PLEASE')).toBe(true);
  });
});

describe('hasWholeWordStem space vs hyphen branch (L87–88)', () => {
  it('matches hyphenated OPT-OUT via escaped pattern', () => {
    expect(hasWholeWordStem('PLEASE OPT-OUT NOW', 'OPT-OUT')).toBe(true);
    expect(classifyOptOut('PLEASE OPT-OUT NOW')).toEqual({
      kind: 'ambiguous',
      reason: 'keyword_in_sentence',
    });
  });

  it('matches spaced OPT OUT via multiword stem branch', () => {
    expect(hasWholeWordStem('PLEASE OPT OUT NOW', 'OPT OUT')).toBe(true);
    expect(classifyOptOut('PLEASE OPT OUT NOW')).toEqual({
      kind: 'ambiguous',
      reason: 'keyword_in_sentence',
    });
  });

  it('matches single-token stems without escape path', () => {
    expect(hasWholeWordStem('PLEASE STOP NOW', 'STOP')).toBe(true);
    expect(hasWholeWordStem('XXXENDYYY', 'END')).toBe(false);
  });

  it('covers hyphen-only word stem in OPT_OUT_WORD_STEMS', () => {
    expect(OPT_OUT_WORD_STEMS).toContain('OPT-OUT');
    expect(hasWholeWordStem('X OPT-OUT Y', 'OPT-OUT')).toBe(true);
  });

  it('escapes regex metacharacters in multiword/hyphen stems', () => {
    // Space/hyphen branch runs escape. Without escape, "A+" means one-or-more A.
    expect(hasWholeWordStem('X A+ B Y', 'A+ B')).toBe(true);
    expect(hasWholeWordStem('X AAA B Y', 'A+ B')).toBe(false);
    expect(hasWholeWordStem('X A+B-C Y', 'A+B-C')).toBe(true);
    expect(hasWholeWordStem('X AAABC Y', 'A+B-C')).toBe(false);
    // Single-token path does NOT escape — forcing the multiword branch would
    // incorrectly match literal A+B via escape.
    expect(hasWholeWordStem('X A+B Y', 'A+B')).toBe(false);
  });

  it('space-only multiword stem still uses escaped whole-word boundaries', () => {
    expect(hasWholeWordStem('PLEASE STOP ALL NOW', 'STOP ALL')).toBe(true);
    expect(hasWholeWordStem('PLEASESTOP ALLNOW', 'STOP ALL')).toBe(false);
  });
});

describe('empty normalized early return (L102, L170)', () => {
  it('emoji-only body normalizes empty → not_opt_out / no backfill', () => {
    expect(normalizeOptOutText('🛑')).toBe('');
    expect(classifyOptOut('🛑')).toEqual({ kind: 'not_opt_out' });
    expect(wouldBackfillSuppress('🛑')).toBe(false);
  });

  it('whitespace-only → not_opt_out and wouldBackfillSuppress false', () => {
    expect(wouldBackfillSuppress('')).toBe(false);
    expect(wouldBackfillSuppress('   \u200b  ')).toBe(false);
  });
});

describe('classifyOptOut whole-message OR branches (L112)', () => {
  it('matches on normalized alone', () => {
    expect(classifyOptOut('STOP').kind).toBe('opt_out');
    expect(wouldBackfillSuppress('STOP')).toBe(true);
  });

  it('matches on compact alone (spaced letters)', () => {
    expect(classifyOptOut('S T O P').kind).toBe('opt_out');
    expect(wouldBackfillSuppress('S T O P')).toBe(true);
    expect(compactOptOutText(normalizeOptOutText('S T O P'))).toBe('STOP');
  });

  it('matches on collapsed alone (spaced letters + trailing words)', () => {
    expect(classifyOptOut('S T O P PLEASE').kind).toBe('opt_out');
    expect(wouldBackfillSuppress('S T O P PLEASE')).toBe(true);
    expect(collapseSpacedLetterTokens(normalizeOptOutText('S T O P PLEASE'))).toBe(
      'STOP PLEASE'
    );
  });

  it('matches when collapsed compact hits STOPSTOP (collapsed text not in exact set)', () => {
    const body = 'S T O P S T O P';
    const normalized = normalizeOptOutText(body);
    expect(normalized).toBe('S T O P S T O P');
    expect(collapseSpacedLetterTokens(normalized)).toBe('STOPSTOP');
    expect(classifyOptOut(body).kind).toBe('opt_out');
    expect(wouldBackfillSuppress(body)).toBe(true);
  });

  it('LEAVE ME ALONE matches only the normalized whole-message arm', () => {
    // compact LEAVEMEALONE is not in WHOLE_COMPACT_SET — kills first-arm false /
    // normalized&&compact mutants on classify + wouldBackfillSuppress.
    expect(classifyOptOut('LEAVE ME ALONE').kind).toBe('opt_out');
    expect(wouldBackfillSuppress('LEAVE ME ALONE')).toBe(true);
    expect(compactOptOutText(normalizeOptOutText('LEAVE ME ALONE'))).toBe(
      'LEAVEMEALONE'
    );
  });
});

describe('ambiguous stem OR on normalized vs collapsed (L123, L131)', () => {
  it('STOP stem matches only after collapseSpacedLetterTokens', () => {
    const body = 'S T O P BY TODAY';
    const normalized = normalizeOptOutText(body);
    expect(hasWholeWordStem(normalized, 'STOP')).toBe(false);
    expect(hasWholeWordStem(collapseSpacedLetterTokens(normalized), 'STOP')).toBe(
      true
    );
    expect(classifyOptOut(body)).toEqual({
      kind: 'ambiguous',
      reason: 'keyword_in_sentence',
    });
  });

  it('multiword STOP ALL stem matches on collapsed text', () => {
    const body = 'S T O P  ALL please stop texts';
    const normalized = normalizeOptOutText(body);
    expect(hasWholeWordStem(normalized, 'STOP ALL')).toBe(false);
    expect(
      hasWholeWordStem(collapseSpacedLetterTokens(normalized), 'STOP ALL')
    ).toBe(true);
    expect(classifyOptOut(body)).toEqual({
      kind: 'ambiguous',
      reason: 'keyword_in_sentence',
    });
    expect(OPT_OUT_MULTIWORD_STEMS).toContain('STOP ALL');
  });
});

describe('collapseSpacedLetterTokens regex (L143–144)', () => {
  it('collapses runs with multiple spaces between letters', () => {
    expect(collapseSpacedLetterTokens('S  T  O  P')).toBe('STOP');
    expect(collapseSpacedLetterTokens('S  T  O  P PLEASE')).toBe('STOP PLEASE');
  });

  it('feeds classifyOptOut when normalize already collapsed outer whitespace', () => {
    expect(normalizeOptOutText('S  T  O  P')).toBe('S T O P');
    expect(classifyOptOut('S  T  O  P').kind).toBe('opt_out');
  });

  it('requires at least one spaced single-letter pair (not a lone letter)', () => {
    expect(collapseSpacedLetterTokens('S PLEASE')).toBe('S PLEASE');
    expect(collapseSpacedLetterTokens('A B')).toBe('AB');
  });
});

describe('normalizeOptOutText newline + trim chain', () => {
  it('newlines become spaces and surrounding whitespace is trimmed before upper', () => {
    expect(normalizeOptOutText('\nSTOP\n')).toBe('STOP');
    expect(normalizeOptOutText('  STOP\r\nALL  ')).toBe('STOP ALL');
  });

  it('edge quotes stripped after newline collapse', () => {
    expect(normalizeOptOutText('"\nSTOP\n"')).toBe('STOP');
  });
});

describe('opt-out-data sqlQuotedList and backfill lists', () => {
  it('sqlQuotedList doubles apostrophes for SQL literals', () => {
    expect(sqlQuotedList(["DON'T TEXT ME", 'PLAIN'])).toBe(
      "'DON''T TEXT ME', 'PLAIN'"
    );
    const apostropheTokens = OPT_OUT_WHOLE_MESSAGE.filter((t) => t.includes("'"));
    expect(apostropheTokens.length).toBeGreaterThan(0);
    for (const token of apostropheTokens) {
      const quoted = sqlQuotedList([token]);
      expect(quoted.startsWith("'")).toBe(true);
      expect(quoted.endsWith("'")).toBe(true);
      expect(quoted).toContain("''");
      expect(quoted).toBe(`'${token.replace(/'/g, "''")}'`);
    }
  });

  it('backfill list helpers mirror const arrays (length + contents)', () => {
    expect(optOutBackfillExactList()).toHaveLength(OPT_OUT_WHOLE_MESSAGE.length);
    expect(optOutBackfillExactList()).toEqual([...OPT_OUT_WHOLE_MESSAGE]);
    expect(optOutBackfillCompactList()).toHaveLength(
      OPT_OUT_WHOLE_MESSAGE_COMPACT.length
    );
    expect(optOutBackfillCompactList()).toEqual([
      ...OPT_OUT_WHOLE_MESSAGE_COMPACT,
    ]);
  });

  it('sqlQuotedList joins multiple tokens with comma-space', () => {
    expect(sqlQuotedList(['A', 'B'])).toBe("'A', 'B'");
  });
});
