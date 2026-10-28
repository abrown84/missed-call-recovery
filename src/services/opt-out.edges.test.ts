import { describe, expect, it } from 'vitest';
import {
  classifyOptOut,
  compactOptOutText,
  foldConfusables,
  isDefiniteOptOut,
  normalizeOptOutText,
  optOutBackfillTokens,
} from './opt-out';

describe('opt-out edge killers', () => {
  it('empty / whitespace is not opt-out', () => {
    expect(classifyOptOut('')).toEqual({ kind: 'not_opt_out' });
    expect(classifyOptOut('   ')).toEqual({ kind: 'not_opt_out' });
  });

  it('service-talk STOP is ambiguous (needs review), never silent not_opt_out', () => {
    expect(classifyOptOut("won't stop leaking")).toEqual({
      kind: 'ambiguous',
      reason: 'keyword_in_sentence',
    });
    expect(classifyOptOut("doesn't stop dripping")).toEqual({
      kind: 'ambiguous',
      reason: 'keyword_in_sentence',
    });
    expect(classifyOptOut('stop by the office')).toEqual({
      kind: 'ambiguous',
      reason: 'keyword_in_sentence',
    });
    expect(isDefiniteOptOut('never stop trying')).toBe(false);
    expect(isDefiniteOptOut('cant stop the leak')).toBe(false);
    expect(classifyOptOut('CAN YOU STOP TEXTING PLEASE').kind).toBe(
      'ambiguous'
    );
  });

  it('plain service chatter falls through to not_opt_out object', () => {
    expect(classifyOptOut('My water heater is leaking')).toEqual({
      kind: 'not_opt_out',
    });
    expect(classifyOptOut('hello')).toEqual({ kind: 'not_opt_out' });
    expect(classifyOptOut('book me for next Tuesday')).toEqual({
      kind: 'not_opt_out',
    });
  });

  it('foldConfusables maps Cyrillic te and dze', () => {
    expect(foldConfusables('ѕтор')).toBe('STOP');
    expect(normalizeOptOutText('ѕтор')).toBe('STOP');
  });

  it('compact removes spaces', () => {
    expect(compactOptOutText('S T O P')).toBe('STOP');
    expect(compactOptOutText('STOP STOP')).toBe('STOPSTOP');
  });

  it('backfill tokens include STOP and STOPSTOP', () => {
    const t = optOutBackfillTokens();
    expect(t).toContain('STOP');
    expect(t).toContain('STOPSTOP');
    expect(t).toContain('PLEASE STOP TEXTING ME');
  });
});
