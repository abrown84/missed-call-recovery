import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  classifyOptOut,
  compactOptOutText,
  containsOptOutKeyword,
  isDefiniteOptOut,
  isServiceTalkWithStop,
  normalizeOptOutText,
} from './opt-out';

describe('opt-out normalize killers', () => {
  it('strips emoji exactly (not replaced with filler)', () => {
    expect(normalizeOptOutText('Stop 🛑')).toBe('STOP');
    expect(normalizeOptOutText('🛑STOP🛑')).toBe('STOP');
  });

  it('nbsp becomes space then collapses', () => {
    expect(normalizeOptOutText('STOP\u00a0PLEASE')).toBe('STOP PLEASE');
    expect(normalizeOptOutText('TAKE\u00a0ME\u00a0OFF')).toBe('TAKE ME OFF');
  });

  it('newlines become spaces (need + quantifier, not empty replace)', () => {
    expect(normalizeOptOutText('STOP\nPLEASE')).toBe('STOP PLEASE');
    expect(normalizeOptOutText('STOP\r\n\r\nPLEASE')).toBe('STOP PLEASE');
    expect(normalizeOptOutText('do not\ncontact me')).toBe('DO NOT CONTACT ME');
  });

  it('trims leading/trailing whitespace before match', () => {
    expect(normalizeOptOutText('  STOP  ')).toBe('STOP');
    expect(normalizeOptOutText('\tSTOP\n')).toBe('STOP');
    expect(isDefiniteOptOut('  STOP  ')).toBe(true);
  });

  it('strips surrounding quotes (multi + smart quotes)', () => {
    expect(normalizeOptOutText('"STOP"')).toBe('STOP');
    expect(normalizeOptOutText("'STOP'")).toBe('STOP');
    expect(normalizeOptOutText('`STOP`')).toBe('STOP');
    expect(normalizeOptOutText('""STOP""')).toBe('STOP');
    expect(normalizeOptOutText('\u201cSTOP\u201d')).toBe('STOP'); // “ ”
    expect(normalizeOptOutText('\u2018STOP\u2019')).toBe('STOP'); // ‘ ’
    expect(normalizeOptOutText('"""STOP"""')).toBe('STOP');
  });

  it('strips trailing punctuation only (not mid-token)', () => {
    expect(normalizeOptOutText('STOP!')).toBe('STOP');
    expect(normalizeOptOutText('STOP???')).toBe('STOP');
    expect(normalizeOptOutText('STOP...')).toBe('STOP');
    expect(normalizeOptOutText('STOP…')).toBe('STOP');
    expect(normalizeOptOutText('STOP!!!')).toBe('STOP');
    // Mid-token bang must survive — kills /[?!.,…]+/g (global unanchored)
    expect(normalizeOptOutText('ST!OP')).toBe('ST!OP');
  });

  it('collapses runs of whitespace to a single space (not delete all)', () => {
    expect(normalizeOptOutText('STOP  PLEASE')).toBe('STOP PLEASE');
    expect(normalizeOptOutText('TAKE   ME    OFF')).toBe('TAKE ME OFF');
  });
});

describe('opt-out contains / compact killers', () => {
  it('phrases take me off / do not contact are definite opt-out', () => {
    expect(classifyOptOut('take me off your list')).toEqual({ kind: 'opt_out' });
    expect(classifyOptOut('do not contact me')).toEqual({ kind: 'opt_out' });
    expect(classifyOptOut('please take me off the list')).toEqual({
      kind: 'opt_out',
    });
    expect(containsOptOutKeyword('TAKE ME OFF YOUR LIST')).toBe(true);
    expect(containsOptOutKeyword('DO NOT CONTACT ME')).toBe(true);
  });

  it('compact STOPPLEASE / PLEASESTOP / STOPSTOPSTOP', () => {
    expect(containsOptOutKeyword('STOPPLEASE', 'STOPPLEASE')).toBe(true);
    expect(containsOptOutKeyword('PLEASESTOP', 'PLEASESTOP')).toBe(true);
    expect(containsOptOutKeyword('STOPSTOPSTOP', 'STOPSTOPSTOP')).toBe(true);
    expect(isDefiniteOptOut('STOPPLEASE')).toBe(true);
    expect(isDefiniteOptOut('PLEASESTOP')).toBe(true);
    expect(compactOptOutText('STOP PLEASE')).toBe('STOPPLEASE');
  });

  it('compact END (length === 3) inside alphanumeric blob', () => {
    // Word-boundary misses XXXENDYYY; compact path with kw.length >= 3 must hit.
    expect(containsOptOutKeyword('XXXENDYYY', 'XXXENDYYY')).toBe(true);
    // length > 3 mutant would drop END (len 3)
    expect(containsOptOutKeyword('PLEASEEND', 'PLEASEEND')).toBe(true);
  });

  it('multi-word keyword OPT OUT via includes, not only compact', () => {
    expect(containsOptOutKeyword('PLEASE OPT OUT NOW')).toBe(true);
    expect(containsOptOutKeyword('I WANT TO OPT OUT')).toBe(true);
  });

  it('single-token keyword via word boundary', () => {
    expect(containsOptOutKeyword('PLEASE QUIT NOW')).toBe(true);
    expect(containsOptOutKeyword('CANCEL MY SERVICE')).toBe(true);
    // No keyword stem → false (compact path must not false-positive)
    expect(containsOptOutKeyword('HELLO THERE', 'HELLOTHERE')).toBe(false);
  });

  it('empty normalized is not opt-out (guard)', () => {
    expect(classifyOptOut('')).toEqual({ kind: 'not_opt_out' });
    expect(classifyOptOut('   \n\t  ')).toEqual({ kind: 'not_opt_out' });
  });

  it('ambiguous regex path skips when normalized is exactly STOP', () => {
    // normalized === 'STOP' short-circuits before AMBIGUOUS even if raw were odd
    expect(classifyOptOut('STOP')).toEqual({ kind: 'opt_out' });
    expect(classifyOptOut('wrong number')).toEqual({
      kind: 'ambiguous',
      reason: 'needs_human_review',
    });
  });
});

describe('opt-out service-talk STOP variants', () => {
  it('apostrophe-optional WONT/WON\'T and DOESNT/DOESN\'T', () => {
    expect(isServiceTalkWithStop("WON'T STOP LEAKING")).toBe(true);
    expect(isServiceTalkWithStop('WONT STOP LEAKING')).toBe(true);
    expect(isServiceTalkWithStop("DOESN'T STOP DRIPPING")).toBe(true);
    expect(isServiceTalkWithStop('DOESNT STOP DRIPPING')).toBe(true);
    expect(isServiceTalkWithStop("DIDN'T STOP COMING")).toBe(true);
    expect(isServiceTalkWithStop('DIDNT STOP COMING')).toBe(true);
    expect(isServiceTalkWithStop('CANT STOP THE LEAK')).toBe(true);
    expect(isServiceTalkWithStop("CAN'T STOP THE LEAK")).toBe(true);
    expect(isServiceTalkWithStop('NEVER STOP TRYING')).toBe(true);
  });

  it('STOP BY/IN/AT/THE/LEAKING/DRIPPING/COMING needs flexible whitespace', () => {
    expect(isServiceTalkWithStop('STOP BY TODAY')).toBe(true);
    expect(isServiceTalkWithStop('STOP  BY TODAY')).toBe(true); // \\s+ not \\s
    expect(isServiceTalkWithStop('STOP IN THE MORNING')).toBe(true);
    expect(isServiceTalkWithStop('STOP AT NOON')).toBe(true);
    expect(isServiceTalkWithStop('STOP THE LEAK')).toBe(true);
    expect(isServiceTalkWithStop('STOP LEAKING PLEASE')).toBe(true);
    expect(isServiceTalkWithStop('STOP DRIPPING NOW')).toBe(true);
    expect(isServiceTalkWithStop('STOP COMING OVER')).toBe(true);
  });

  it('WONT/DOESNT STOP mid-message via \\b...\\s+STOP\\b', () => {
    expect(isServiceTalkWithStop('IT WONT STOP')).toBe(true);
    expect(isServiceTalkWithStop("IT WON'T STOP")).toBe(true);
    expect(isServiceTalkWithStop('IT DOESNT STOP')).toBe(true);
    expect(isServiceTalkWithStop("IT DOESN'T STOP")).toBe(true);
    // \\S+ mutant would require non-space between — space must work
    expect(isServiceTalkWithStop('PIPE WONT STOP')).toBe(true);
  });

  it('exact STOP is not service talk; no STOP → false', () => {
    expect(isServiceTalkWithStop('STOP')).toBe(false);
    expect(isServiceTalkWithStop('HELLO THERE')).toBe(false);
    expect(isServiceTalkWithStop('CAN YOU STOP TEXTING PLEASE')).toBe(false);
  });

  it('leading-anchor: WONT not at start without STOP-adjacent still needs ^ for alt1', () => {
    // First alt requires ^ — "PLEASE WONT HELP" has no STOP → false via line 136
    expect(isServiceTalkWithStop('PLEASE WONT HELP')).toBe(false);
  });
});

describe('opt-out normalize property', () => {
  it('normalize is idempotent uppercase ASCII letters', () => {
    fc.assert(
      fc.property(fc.constantFrom('STOP', 'QUIT', 'END', 'CANCEL'), (t) => {
        const n = normalizeOptOutText(t);
        expect(normalizeOptOutText(n)).toBe(n);
        expect(n).toBe(t);
      }),
      { numRuns: 20 }
    );
  });
});
