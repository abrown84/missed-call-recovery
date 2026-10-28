/**
 * Opt-out survivor / normalizer killers under the QC r7 whole-message policy.
 */
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  classifyOptOut,
  compactOptOutText,
  foldConfusables,
  hasWholeWordStem,
  normalizeOptOutText,
  replaceNbspWithSpace,
  stripEdgeQuotes,
} from './opt-out';

describe('opt-out normalize helpers (survivor killers)', () => {
  it('replaceNbspWithSpace keeps a real space (not delete)', () => {
    expect(replaceNbspWithSpace('STOP\u00a0PLEASE')).toBe('STOP PLEASE');
    expect(normalizeOptOutText('STOP\u00a0PLEASE')).toBe('STOP PLEASE');
  });

  it('stripEdgeQuotes needs both ^ and $ anchors', () => {
    expect(stripEdgeQuotes('"STOP"')).toBe('STOP');
    expect(stripEdgeQuotes('"STOP')).toBe('STOP');
    expect(stripEdgeQuotes('STOP"')).toBe('STOP');
    expect(normalizeOptOutText('"stop"')).toBe('STOP');
  });
});

describe('opt-out normalize killers', () => {
  it('strips emoji exactly (not replaced with filler)', () => {
    expect(normalizeOptOutText('STOP🛑')).toBe('STOP');
  });

  it('nbsp becomes space then collapses', () => {
    expect(normalizeOptOutText('STOP\u00a0\u00a0ALL')).toBe('STOP ALL');
  });

  it('newlines become spaces (need + quantifier, not empty replace)', () => {
    expect(normalizeOptOutText('STOP\n\nALL')).toBe('STOP ALL');
  });

  it('trims leading/trailing whitespace before match', () => {
    expect(normalizeOptOutText('  STOP  ')).toBe('STOP');
  });

  it('strips surrounding quotes (multi + smart quotes)', () => {
    expect(normalizeOptOutText('“STOP”')).toBe('STOP');
    expect(normalizeOptOutText("‘QUIT’")).toBe('QUIT');
  });

  it('strips trailing punctuation only (not mid-token)', () => {
    expect(normalizeOptOutText('STOP!!!')).toBe('STOP');
    expect(normalizeOptOutText('STOP.')).toBe('STOP');
  });

  it('collapses runs of whitespace to a single space (not delete all)', () => {
    expect(normalizeOptOutText('OPT    OUT')).toBe('OPT OUT');
  });
});

describe('opt-out whole-message / whole-word policy', () => {
  it('compact whole-message STOPPLEASE is NOT auto opt-out (not in compact set)', () => {
    // Compact set is whole-message forms only; STOPPLEASE is not a carrier keyword.
    expect(classifyOptOut('STOPPLEASE').kind).not.toBe('opt_out');
  });

  it('compact STOPSTOP / STOPSTOPSTOP are whole-message opt_out', () => {
    expect(classifyOptOut('STOP STOP').kind).toBe('opt_out');
    expect(classifyOptOut('STOP STOP STOP').kind).toBe('opt_out');
    expect(compactOptOutText('STOP STOP STOP')).toBe('STOPSTOPSTOP');
  });

  it('END inside alphanumeric blob is not a whole word', () => {
    expect(hasWholeWordStem('XXXENDYYY', 'END')).toBe(false);
    expect(classifyOptOut('XXXENDYYY').kind).toBe('not_opt_out');
  });

  it('OPT OUT / CANCEL as whole words in longer text → ambiguous', () => {
    expect(classifyOptOut('PLEASE OPT OUT NOW').kind).toBe('ambiguous');
    expect(classifyOptOut('CANCEL MY SERVICE').kind).toBe('ambiguous');
    expect(classifyOptOut('I WANT TO QUIT').kind).toBe('ambiguous');
  });

  it('empty normalized is not opt-out', () => {
    expect(classifyOptOut('').kind).toBe('not_opt_out');
    expect(classifyOptOut('   ').kind).toBe('not_opt_out');
  });

  it('foldConfusables maps Cyrillic te', () => {
    expect(foldConfusables('\u0422')).toBe('T');
  });
});

describe('opt-out service-talk / keyword-in-sentence → ambiguous', () => {
  it('STOP BY / WONT STOP style messages are ambiguous not opt_out', () => {
    for (const body of [
      'STOP BY TODAY',
      'WONT STOP LEAKING',
      "WON'T STOP LEAKING",
      'IT DOESNT STOP',
      'STOP THE LEAK',
    ]) {
      expect(classifyOptOut(body).kind, body).toBe('ambiguous');
    }
  });

  it('exact STOP is opt_out', () => {
    expect(classifyOptOut('STOP').kind).toBe('opt_out');
  });
});

describe('opt-out normalize property', () => {
  it('normalize is idempotent uppercase ASCII letters', () => {
    // Regression: punct after a quote (`#"!`) must still be idempotent.
    expect(normalizeOptOutText('#"!')).toBe(normalizeOptOutText(normalizeOptOutText('#"!')));
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (s) => {
        const once = normalizeOptOutText(s);
        expect(normalizeOptOutText(once)).toBe(once);
      }),
      { numRuns: 80, seed: -1799525932 }
    );
  });
});
