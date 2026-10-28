/**
 * QC r8: lookalikes, consistent repeats, ambiguous pause policy fixtures.
 */
import { describe, expect, it } from 'vitest';
import { classifyOptOut, foldConfusables, normalizeOptOutText } from './opt-out';
import { CONFUSABLES, OPT_OUT_WHOLE_MESSAGE_COMPACT } from './opt-out-data';

describe('QC r8 lookalike confusables (kill static opt-out-data mutants)', () => {
  it('Greek lowercase omicron ο folds into STOP/REVOKE', () => {
    // STοP / REVοKE with U+03BF (not \u03BFO… — that eats the following O)
    expect(classifyOptOut('ST\u03BFP').kind).toBe('opt_out');
    expect(classifyOptOut('REV\u03BFKE').kind).toBe('opt_out');
    expect(CONFUSABLES['\u03BF']).toBe('o');
  });

  it('Cyrillic У/у fold so QУIT / УNSУBSCRIBE opt out', () => {
    expect(classifyOptOut('Q\u0423IT').kind).toBe('opt_out');
    expect(classifyOptOut('\u0423NS\u0423BSCRIBE').kind).toBe('opt_out');
    expect(classifyOptOut('q\u0443it').kind).toBe('opt_out');
    expect(CONFUSABLES['\u0423']).toBe('U');
    expect(CONFUSABLES['\u0443']).toBe('u');
  });

  it('digit 0 lookalike maps to O (St0p / 0PT0UT)', () => {
    expect(classifyOptOut('St0p').kind).toBe('opt_out');
    expect(classifyOptOut('0PT0UT').kind).toBe('opt_out');
    expect(CONFUSABLES['0']).toBe('O');
    expect(foldConfusables('St0p')).toBe('StOp');
  });

  it('each CONFUSABLES mapping is load-bearing for at least one fold', () => {
    for (const [src, dst] of Object.entries(CONFUSABLES)) {
      expect(foldConfusables(src), `fold ${JSON.stringify(src)}`).toBe(dst);
      // Blanking the mapping must change the fold (kills StringLiteral → "").
      expect(src === dst || foldConfusables(src) !== src || dst === src).toBe(
        true
      );
      expect(dst.length).toBeGreaterThan(0);
    }
  });
});

describe('QC r8 repeated keywords are consistent', () => {
  it('STOP STOP and END END (and peers) are whole-message opt_out', () => {
    for (const body of [
      'STOP STOP',
      'END END',
      'CANCEL CANCEL',
      'QUIT QUIT',
      'UNSUBSCRIBE UNSUBSCRIBE',
      'REVOKE REVOKE',
      'OPTOUT OPTOUT',
      'STOPALL STOPALL',
    ]) {
      expect(classifyOptOut(body).kind, body).toBe('opt_out');
    }
  });

  it('compact doubles are in the compact whole-message set', () => {
    for (const c of [
      'STOPSTOP',
      'ENDEND',
      'CANCELCANCEL',
      'QUITQUIT',
      'UNSUBSCRIBEUNSUBSCRIBE',
      'REVOKEREVOKE',
      'OPTOUTOPTOUT',
    ]) {
      expect(OPT_OUT_WHOLE_MESSAGE_COMPACT, c).toContain(c);
    }
  });
});

describe('QC r8 ambiguous vs opt_out fixtures', () => {
  it('"Stop texting me, I already hired someone" is ambiguous (not silent continue)', () => {
    expect(
      classifyOptOut('Stop texting me, I already hired someone').kind
    ).toBe('ambiguous');
  });

  it('"Can you stop by at 3?" is ambiguous (service talk)', () => {
    expect(classifyOptOut('Can you stop by at 3?').kind).toBe('ambiguous');
  });

  it('quoted / emoji / zero-width / dashed STOP still opt_out after normalize', () => {
    for (const body of [
      '"STOP"',
      '“Stop”',
      'STOP 🛑',
      'STOP!!🙏',
      'QUIT 🙂',
      'S-T-O-P',
      'STOP\u200b',
      'ST\u039FP', // Greek capital omicron
      'end :)',
    ]) {
      expect(classifyOptOut(body).kind, body).toBe('opt_out');
      expect(normalizeOptOutText(body).length, body).toBeGreaterThan(0);
    }
  });
});
