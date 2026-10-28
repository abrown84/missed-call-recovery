/**
 * QC r7 opt-out: whole-message auto-suppress, keyword-in-sentence → ambiguous,
 * ≥50 negative fixtures of normal service replies, app↔SQL parity.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyOptOut,
  normalizeOptOutText,
  wouldBackfillSuppress,
} from './opt-out';
import {
  OPT_OUT_WHOLE_MESSAGE,
  OPT_OUT_WHOLE_MESSAGE_COMPACT,
  optOutBackfillCompactList,
  optOutBackfillExactList,
  sqlQuotedList,
} from './opt-out-data';

/** QC r7 §5 examples + normal booking replies — must NOT auto-suppress. */
export const NEGATIVE_SERVICE_REPLIES: string[] = [
  'Can you come next weekend?',
  'end of day is fine',
  "I'll send pics",
  'My friend referred me',
  'The leak stopped but came back',
  'Quite urgent please',
  'recommend a time?',
  'calendar is open',
  'pending insurance',
  'I need a quote, can you send someone',
  'Yes please send someone today',
  'Do you do weekends?',
  'Tuesday works, my AC quit',
  'Can you come by end of day?',
  'I need to cancel and reschedule to Friday',
  'weekend works',
  'What time can you come?',
  'Morning is better for me',
  'Please call me back',
  'The water heater is out',
  'No heat since last night',
  'AC not cooling upstairs',
  'How much for a tune up?',
  'Are you available tomorrow?',
  'Someone will be home after 5',
  'Gate code is 1234',
  'Park in the driveway',
  'Dog is friendly',
  'Use the side entrance',
  'We already called another company',
  'Still waiting on parts',
  'Is this covered by warranty?',
  'Can you text me an ETA?',
  'Running late, still coming?',
  'Thanks for coming out yesterday',
  'Invoice looked good',
  'Need a second opinion',
  'The drain is clogged again',
  'Toilet keeps running',
  'Furnace making noise',
  'Breaker keeps tripping',
  'Smell gas near the stove',
  'Basement has standing water',
  'Roof leak over the garage',
  'Ice maker stopped working',
  'Garbage disposal jammed',
  'Dishwasher will not drain',
  'Sump pump failed overnight',
  'Generator will not start',
  'Pool pump is quiet now',
  'Sprinklers overshoot the sidewalk',
  'Fence gate will not latch',
  'Garage door opener quit working mid-cycle wait no just stuck',
  'The appointment at the end of next week works',
  'Please do not cancel the visit, just move it',
  'Can you stop by after lunch?',
];

describe('QC r7 opt-out whole-message vs keyword-in-sentence', () => {
  it('whole-message carrier keywords → opt_out', () => {
    for (const token of [
      'STOP',
      'stop',
      'Stop!',
      'STOPALL',
      'UNSUBSCRIBE',
      'CANCEL',
      'END',
      'QUIT',
      'OPT OUT',
      'opt-out',
      'REVOKE',
      'please stop',
      'STOP PLEASE',
      'S T O P',
    ]) {
      expect(classifyOptOut(token).kind, token).toBe('opt_out');
    }
  });

  it('keyword as whole word in longer message → ambiguous (not opt_out)', () => {
    const cases = [
      'cancel my appointment',
      'end of day is fine',
      'Tuesday works, my AC quit',
      'I need to cancel and reschedule to Friday',
      'Can you come by end of day?',
      'Please do not cancel the visit, just move it',
      'Can you stop by after lunch?',
    ];
    for (const body of cases) {
      const v = classifyOptOut(body);
      expect(v.kind, body).toBe('ambiguous');
    }
  });

  it('stopped/ending as substrings are not whole-word keywords', () => {
    expect(classifyOptOut('The leak stopped but came back').kind).toBe(
      'not_opt_out'
    );
    expect(classifyOptOut('pending insurance').kind).toBe('not_opt_out');
  });

  it('≥50 negative fixtures of normal replies are not auto-suppressed', () => {
    expect(NEGATIVE_SERVICE_REPLIES.length).toBeGreaterThanOrEqual(50);
    for (const body of NEGATIVE_SERVICE_REPLIES) {
      const v = classifyOptOut(body);
      expect(v.kind, body).not.toBe('opt_out');
    }
  });

  it('empty / whitespace → not_opt_out', () => {
    expect(classifyOptOut('').kind).toBe('not_opt_out');
    expect(classifyOptOut('   ').kind).toBe('not_opt_out');
  });

  it('shared lists power both exact and compact backfill helpers', () => {
    expect(optOutBackfillExactList()).toEqual([...OPT_OUT_WHOLE_MESSAGE]);
    expect(optOutBackfillCompactList()).toEqual([
      ...OPT_OUT_WHOLE_MESSAGE_COMPACT,
    ]);
  });
});

describe('app ↔ SQL backfill parity on shared corpus', () => {
  const CORPUS = [
    ...OPT_OUT_WHOLE_MESSAGE.slice(0, 20),
    ...NEGATIVE_SERVICE_REPLIES,
    'STOP',
    'cancel my appointment',
    'end of day',
    'Can you come next weekend?',
  ];

  it('wouldBackfillSuppress ≡ classifyOptOut.opt_out on the same corpus', () => {
    for (const body of CORPUS) {
      const app = classifyOptOut(body).kind === 'opt_out';
      const sql = wouldBackfillSuppress(body);
      expect(sql, body).toBe(app);
    }
  });

  it('mid-sentence END/CANCEL never backfill-suppress', () => {
    expect(wouldBackfillSuppress('Can you come by end of day?')).toBe(false);
    expect(
      wouldBackfillSuppress('I need to cancel and reschedule to Friday')
    ).toBe(false);
  });

  it('normalize is stable for parity keys', () => {
    expect(normalizeOptOutText('  stop!!! ')).toBe('STOP');
    expect(normalizeOptOutText('Opt Out')).toBe('OPT OUT');
  });

  it('normalize is idempotent for trailing punct+space (CI flake "! ,")', () => {
    for (const s of ['! ,', 'STOP?! ', ' , ', 'end.', 'cancel…']) {
      const once = normalizeOptOutText(s);
      expect(normalizeOptOutText(once)).toBe(once);
    }
  });
});
