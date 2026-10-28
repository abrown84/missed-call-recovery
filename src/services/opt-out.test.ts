import { describe, expect, it } from 'vitest';
import {
  OPT_OUT_FOOTER,
  classifyOptOut,
  isDefiniteOptOut,
  normalizeOptOutText,
} from './opt-out';

describe('opt-out whole-message NFKC', () => {
  it('matches exact STOP-family tokens', () => {
    for (const t of [
      'STOP',
      'stop',
      'Stop!',
      'STOPALL',
      'STOP ALL',
      'UNSUBSCRIBE',
      'QUIT',
      'END',
      'CANCEL',
      'OPT OUT',
      'OPTOUT',
      'OPT-OUT',
      'REVOKE',
      "don't text me again",
      'Please stop',
    ]) {
      expect(isDefiniteOptOut(t), t).toBe(true);
    }
  });

  it('matches full-width STOP via NFKC', () => {
    // Full-width Latin S T O P
    const fullWidth = '\uFF33\uFF34\uFF2F\uFF30';
    expect(normalizeOptOutText(fullWidth)).toBe('STOP');
    expect(isDefiniteOptOut(fullWidth)).toBe(true);
  });

  it('does not false-positive on service language', () => {
    expect(isDefiniteOptOut("won't stop leaking HELP")).toBe(false);
    expect(isDefiniteOptOut('stop by today')).toBe(false);
    expect(isDefiniteOptOut('Please stop the leak')).toBe(false);
    expect(isDefiniteOptOut('My water heater is leaking')).toBe(false);
  });

  it('routes ambiguous phrases to human review', () => {
    expect(classifyOptOut('wrong number')).toEqual({
      kind: 'ambiguous',
      reason: 'needs_human_review',
    });
    expect(classifyOptOut('remove me')).toEqual({
      kind: 'ambiguous',
      reason: 'needs_human_review',
    });
    expect(classifyOptOut('stop texting')).toEqual({
      kind: 'ambiguous',
      reason: 'needs_human_review',
    });
  });

  it('exposes FCC STOP footer', () => {
    expect(OPT_OUT_FOOTER).toBe('Reply STOP to opt out.');
  });
});
