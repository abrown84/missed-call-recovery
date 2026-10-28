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

  it('does not auto-suppress service language (ambiguous or not_opt_out)', () => {
    expect(isDefiniteOptOut("won't stop leaking HELP")).toBe(false);
    expect(isDefiniteOptOut('stop by today')).toBe(false);
    expect(isDefiniteOptOut('My water heater is leaking')).toBe(false);
    expect(classifyOptOut("won't stop leaking HELP").kind).toBe('ambiguous');
    expect(classifyOptOut('stop by today').kind).toBe('ambiguous');
  });

  it('keyword-in-sentence routes to human review', () => {
    expect(classifyOptOut('cancel my appointment')).toEqual({
      kind: 'ambiguous',
      reason: 'keyword_in_sentence',
    });
    expect(classifyOptOut('end of day is fine')).toEqual({
      kind: 'ambiguous',
      reason: 'keyword_in_sentence',
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

  it('QC r7: longer messages with keywords are ambiguous, not opt_out', () => {
    for (const t of [
      'STOP\nSent from my iPhone',
      'Stop.  Thanks',
      'I want to unsubscribe from these',
      'please cancel the appointment',
    ]) {
      expect(classifyOptOut(t).kind, t).toBe('ambiguous');
    }
  });
});
