import { describe, expect, it } from 'vitest';
import {
  classifyOptOut,
  compactOptOutText,
  foldConfusables,
  isDefiniteOptOut,
  isServiceTalkWithStop,
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
      reason: 'needs_human_review',
    });
    expect(classifyOptOut("doesn't stop dripping")).toEqual({
      kind: 'ambiguous',
      reason: 'needs_human_review',
    });
    expect(classifyOptOut('stop by the office')).toEqual({
      kind: 'ambiguous',
      reason: 'needs_human_review',
    });
    expect(isDefiniteOptOut('never stop trying')).toBe(false);
    expect(isDefiniteOptOut('cant stop the leak')).toBe(false);

    // Direct helper asserts kill BlockStatement→{} emptying the function body.
    expect(isServiceTalkWithStop("WON'T STOP LEAKING")).toBe(true);
    expect(isServiceTalkWithStop("DOESN'T STOP DRIPPING")).toBe(true);
    expect(isServiceTalkWithStop('STOP BY THE OFFICE')).toBe(true);
    expect(isServiceTalkWithStop('NEVER STOP TRYING')).toBe(true);
    expect(isServiceTalkWithStop('CANT STOP THE LEAK')).toBe(true);
    expect(isServiceTalkWithStop('STOP')).toBe(false);
    expect(isServiceTalkWithStop('HELLO THERE')).toBe(false);
    // Has \bSTOP\b but is NOT service-talk — kills return→true on OR-chain.
    expect(isServiceTalkWithStop('CAN YOU STOP TEXTING PLEASE')).toBe(false);
    expect(isServiceTalkWithStop('STOP CALLING MY DOG')).toBe(false);
  });

  it('plain service chatter falls through to not_opt_out object', () => {
    // Kills ObjectLiteral→{} on the final classifyOptOut return.
    expect(classifyOptOut('My water heater is leaking')).toEqual({
      kind: 'not_opt_out',
    });
    expect(classifyOptOut('hello')).toEqual({ kind: 'not_opt_out' });
    expect(classifyOptOut('book me for next Tuesday')).toEqual({
      kind: 'not_opt_out',
    });
  });

  it('foldConfusables maps Cyrillic te and dze', () => {
    expect(foldConfusables('ѕтор')).toBe('stop');
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
