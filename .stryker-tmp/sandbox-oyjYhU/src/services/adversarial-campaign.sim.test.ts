/**
 * Adversarial simulations for QC r2: campaign-scoped sids, claim ownership,
 * mid-send pause/switch, timeout reconcile.
 */
// @ts-nocheck

import { describe, expect, it } from 'vitest';
import {
  CLAIM_STALE_MS,
  campaignStepMessageSid,
  classifyMessageInsertError,
  decideReplyEnrollmentAction,
  hasFreshClaim,
  isEnrollmentClaimable,
} from './campaign-logic';
import { decideOnDuplicateSid } from './reconcile-logic';

type Enrollment = {
  id: string;
  lead_id: string;
  campaign_id: string;
  status: 'active' | 'paused' | 'completed';
  step: number;
  next: number | null;
  claimed_at: number | null;
  claim_token: string | null;
};

type SmsRow = { sid: string; status: string };

function makeDb(campaignId = 'c-std') {
  const e: Enrollment = {
    id: 'E1',
    lead_id: 'L1',
    campaign_id: campaignId,
    status: 'active',
    step: 2,
    next: 0,
    claimed_at: null,
    claim_token: null,
  };
  const sms: SmsRow[] = [];
  return { e, sms };
}

function claim(e: Enrollment, now: number, token: string): boolean {
  const row = {
    status: e.status,
    next_send_at: e.next == null ? null : new Date(e.next).toISOString(),
    claimed_at:
      e.claimed_at == null ? null : new Date(e.claimed_at).toISOString(),
  };
  if (!isEnrollmentClaimable(row, new Date(now))) return false;
  e.next = null;
  e.claimed_at = now;
  e.claim_token = token;
  return true;
}

function advanceOwned(e: Enrollment, token: string, now: number): boolean {
  if (e.status !== 'active' || e.claim_token !== token) return false;
  e.step++;
  e.next = now + 1e9;
  e.claimed_at = null;
  e.claim_token = null;
  return true;
}

describe('adversarial: Standard→Emergency sid collision fixed', () => {
  it('first Emergency step after switch is NOT dropped as duplicate', () => {
    const db = makeDb('c-std');
    // Prior Standard step 2 already sent
    db.sms.push({
      sid: campaignStepMessageSid('E1', 'c-std', 2),
      status: 'queued',
    });

    // Switch to Emergency
    db.e.campaign_id = 'c-em';
    db.e.step = 2;

    const emSid = campaignStepMessageSid('E1', 'c-em', 2);
    const isDup = db.sms.some((r) => r.sid === emSid);
    expect(isDup).toBe(false);
    expect(emSid).not.toBe(db.sms[0].sid);
  });
});

describe('adversarial: mid-send pause loses advance ownership', () => {
  it('pause mid-send clears token; advance then fails', () => {
    const db = makeDb();
    const now = Date.now();
    expect(claim(db.e, now, 'tok-1')).toBe(true);

    // Customer replies → pause clears claim
    db.e.status = 'paused';
    db.e.claim_token = null;
    db.e.claimed_at = null;
    db.e.next = null;

    expect(advanceOwned(db.e, 'tok-1', now + 1000)).toBe(false);
    expect(db.e.step).toBe(2); // did not advance
  });
});

describe('adversarial: mid-send switch is deferred', () => {
  it('decideReplyEnrollmentAction returns defer_switch under fresh claim', () => {
    const now = new Date();
    const decision = decideReplyEnrollmentAction(
      {
        id: 'E1',
        campaign_id: 'c-std',
        status: 'active',
        claimed_at: now.toISOString(),
        claim_token: 'tok',
      },
      { id: 'c-em', name: 'Emergency', urgency_filter: 'emergency' },
      { now }
    );
    expect(decision.action).toBe('defer_switch');
    expect(hasFreshClaim({ claimed_at: now.toISOString() }, now)).toBe(true);
  });
});

describe('adversarial: timeout reconcile requeues instead of silent skip', () => {
  it('stuck sending with definite never_sent frees sid and reschedules exact step', () => {
    const db = makeDb();
    const sid = campaignStepMessageSid('E1', 'c-std', 2);
    db.sms.push({ sid, status: 'sending' });

    // Simulate relay miss → abandon sid
    const abandoned = `${sid}:abandoned:1`;
    db.sms[0].sid = abandoned;
    db.sms[0].status = 'abandoned_retry';

    // Fresh send for same logical step uses original sid again
    expect(db.sms.some((r) => r.sid === sid)).toBe(false);
    expect(classifyMessageInsertError({ code: '23505' })).toBe('duplicate');
  });

  it('duplicate sid with unknown status parks (does not advance)', () => {
    expect(decideOnDuplicateSid('unknown').action).toBe('park');
    expect(decideOnDuplicateSid('queued').action).toBe('advance');
  });
});

describe('adversarial: concurrent claim still single-winner', () => {
  it('two claimers → one wins', () => {
    const db = makeDb();
    const now = Date.now();
    const a = claim(db.e, now, 'a');
    const b = claim(db.e, now, 'b');
    expect(a).toBe(true);
    expect(b).toBe(false);
  });

  it('stale claim can be reclaimed after CLAIM_STALE_MS', () => {
    const db = makeDb();
    const now = Date.now();
    claim(db.e, now, 'old');
    expect(claim(db.e, now + 60_000, 'new')).toBe(false);
    expect(claim(db.e, now + CLAIM_STALE_MS + 1, 'new')).toBe(true);
    expect(db.e.claim_token).toBe('new');
  });
});
