import { describe, expect, it } from 'vitest';
import {
  OPT_OUT_FOOTER,
  classifyOptOut,
  isDefiniteOptOut,
  normalizeOptOutText,
} from './opt-out';

describe('opt-out whole-message NFKC + confusable', () => {
  it('matches exact STOP-family tokens', () => {
    for (const t of [
      'STOP',
      'stop',
      'Stop!',
      'STOP?',
      '"STOP"',
      'STOPALL',
      'UNSUBSCRIBE',
      'QUIT',
      'END',
      'CANCEL',
      'OPT OUT',
      'OPTOUT',
      'REVOKE',
      "don't text me again",
      'Please stop',
      'unsubscribe me',
      'cancel please',
      'stop it',
      'leave me alone',
      'Stop 🛑',
    ]) {
      expect(isDefiniteOptOut(t), t).toBe(true);
    }
  });

  it('strips zero-width and folds full-width', () => {
    expect(isDefiniteOptOut('S\u200BTOP')).toBe(true);
    const fullWidth = '\uFF33\uFF34\uFF2F\uFF30';
    expect(normalizeOptOutText(fullWidth)).toBe('STOP');
    expect(isDefiniteOptOut(fullWidth)).toBe(true);
  });

  it('does not false-positive on service language', () => {
    expect(isDefiniteOptOut("won't stop leaking HELP")).toBe(false);
    expect(isDefiniteOptOut('stop by today')).toBe(false);
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
  });

  it('exposes FCC STOP footer', () => {
    expect(OPT_OUT_FOOTER).toBe('Reply STOP to opt out.');
  });

  it('QC r5 F: Cyrillic стор, spaced STOP, STOP STOP', () => {
    expect(isDefiniteOptOut('ѕтор')).toBe(true);
    expect(isDefiniteOptOut('S T O P')).toBe(true);
    expect(isDefiniteOptOut('STOP STOP')).toBe(true);
    expect(isDefiniteOptOut('please stop texting me')).toBe(true);
  });

  it('QC r6: contains-keyword opt-out (FCC any reasonable means)', () => {
    for (const t of [
      'stop texting',
      'stop pls',
      'dont text me',
      'Unsubscribe me please',
      'STOP\nSent from my iPhone',
      'Stop.  Thanks',
      'Stop all texts',
      'Stop sending',
      'take me off your list',
      'do not contact me',
      'STOP STOP STOP',
      'S T O P please',
    ]) {
      const v = classifyOptOut(t);
      expect(
        v.kind === 'opt_out' || v.kind === 'ambiguous',
        `${t} → ${JSON.stringify(v)}`
      ).toBe(true);
    }
  });
});

