/**
 * Kill remaining Stryker survivors on opt-out.ts / opt-out-data.ts (QC r8).
 */
import { describe, expect, it } from 'vitest';
import {
  classifyOptOut,
  compactOptOutText,
  normalizeOptOutText,
  stripEdgeQuotes,
  wouldBackfillSuppress,
} from './opt-out';
import {
  CONFUSABLES,
  OPT_OUT_WHOLE_MESSAGE_COMPACT,
  compactForms,
  confusableTranslatePairs,
} from './opt-out-data';

describe('opt-out-data compactForms empty guard + confusableTranslatePairs', () => {
  it('compact list never contains empty string', () => {
    expect(OPT_OUT_WHOLE_MESSAGE_COMPACT.includes('')).toBe(false);
    expect(OPT_OUT_WHOLE_MESSAGE_COMPACT.every((c) => c.length > 0)).toBe(true);
    expect(compactForms(['!!!', 'STOP', '---'])).toEqual(['STOP']);
  });

  it('confusableTranslatePairs covers every CONFUSABLES entry', () => {
    const { from, to } = confusableTranslatePairs();
    expect(from.length).toBe(Object.keys(CONFUSABLES).length);
    expect(to.length).toBe(Object.keys(CONFUSABLES).length);
    expect(from.length).toBeGreaterThan(10);
    expect(to).not.toBe('');
    expect(from).not.toBe('');
    // Order pairs match Object.entries
    let i = 0;
    for (const [src, dst] of Object.entries(CONFUSABLES)) {
      expect(from[i]).toBe(src);
      expect(to[i]).toBe(dst);
      i += 1;
    }
  });
});

describe('quote / edge-noise regex anchors', () => {
  it('stripEdgeQuotes does not strip mid-message quotes (needs ^ and $)', () => {
    expect(stripEdgeQuotes('SAY "HI" NOW')).toBe('SAY "HI" NOW');
    expect(stripEdgeQuotes('"SAY "HI" NOW"')).toBe('SAY "HI" NOW');
    expect(stripEdgeQuotes('"STOP"')).toBe('STOP');
    expect(stripEdgeQuotes('""STOP""')).toBe('STOP');
  });

  it('normalize strips stacked edge noise (+ quantifier) but keeps mid punct', () => {
    expect(normalizeOptOutText('!!!STOP!!!')).toBe('STOP');
    expect(normalizeOptOutText('...END...')).toBe('END');
    expect(normalizeOptOutText('???QUIT???')).toBe('QUIT');
    expect(normalizeOptOutText('STOP,PLEASE')).toBe('STOP,PLEASE');
    // Mid bangs must survive (kills EDGE_NOISE leading-only / trailing-only + drop)
    expect(normalizeOptOutText('NO!HEAT')).toBe('NO!HEAT');
    expect(normalizeOptOutText('!!NO!HEAT!!')).toBe('NO!HEAT');
  });
});

describe('whole-message OR arms (normalized vs compact vs collapsed)', () => {
  it('compact-only: spaced letters match via compact, not raw normalized', () => {
    expect(normalizeOptOutText('S T O P')).toBe('S T O P');
    expect(compactOptOutText('S T O P')).toBe('STOP');
    expect(classifyOptOut('S T O P').kind).toBe('opt_out');
    expect(wouldBackfillSuppress('S T O P')).toBe(true);
  });

  it('collapsed-only: spaced STOP PLEASE matches after collapse', () => {
    expect(classifyOptOut('S T O P PLEASE').kind).toBe('opt_out');
    expect(wouldBackfillSuppress('S T O P PLEASE')).toBe(true);
  });

  it('exact whole-message arm without relying on compact alone', () => {
    expect(classifyOptOut('LEAVE ME ALONE').kind).toBe('opt_out');
    expect(wouldBackfillSuppress('LEAVE ME ALONE')).toBe(true);
  });

  it('ambiguous stem hits normalized OR collapsed independently', () => {
    expect(classifyOptOut('please STOP calling').kind).toBe('ambiguous');
    // Collapsed path: spaced keyword buried in sentence
    expect(classifyOptOut('can you S T O P by later').kind).toBe('ambiguous');
  });
});
