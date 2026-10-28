/**
 * Adversarial simulations mirroring the QC sim.mjs scenarios, updated for
 * the fixed semantics: insert-before-send, no auto-resend on timeout,
 * reclaimable claimed_at, unique lead enrollment.
 */
import { describe, expect, it } from 'vitest';
import {
  CLAIM_STALE_MS,
  campaignStepMessageSid,
  classifyMessageInsertError,
  decideReplyEnrollmentAction,
  isEnrollmentClaimable,
} from './campaign-logic';

type Enrollment = {
  id: string;
  lead_id: string;
  campaign_id: string;
  status: 'active' | 'paused' | 'completed';
  step: number;
  next: number | null;
  claimed_at: number | null;
};

type SmsRow = { sid: string; status: string };

function makeDb() {
  const e: Enrollment = {
    id: 'E1',
    lead_id: 'L1',
    campaign_id: 'c-std',
    status: 'active',
    step: 2,
    next: 0,
    claimed_at: null,
  };
  const sms: SmsRow[] = [];
  const enrollmentsByLead = new Map<string, Enrollment>([['L1', e]]);
  return { e, sms, enrollmentsByLead };
}

function claim(e: Enrollment, now: number): boolean {
  const row = {
    status: e.status,
    next_send_at: e.next == null ? null : new Date(e.next).toISOString(),
    claimed_at:
      e.claimed_at == null ? null : new Date(e.claimed_at).toISOString(),
  };
  if (!isEnrollmentClaimable(row, new Date(now))) return false;
  e.next = null;
  e.claimed_at = now;
  return true;
}

async function runSend(
  db: ReturnType<typeof makeDb>,
  mode: 'ok' | 'timeout' | 'crash' = 'ok',
  now = Date.now()
): Promise<string> {
  if (!claim(db.e, now)) return 'skipped';

  const sid = campaignStepMessageSid(db.e.id, db.e.step);

  // Insert-before-send
  if (db.sms.some((r) => r.sid === sid)) {
    // duplicate → advance, no send
    db.e.step++;
    db.e.next = now + 1e9;
    db.e.claimed_at = null;
    return 'dup-skip';
  }
  db.sms.push({ sid, status: 'sending' });

  if (mode === 'crash') {
    // Crash after provider accepted but before advance — claim stuck, sid recorded.
    throw new Error('crash after send');
  }

  if (mode === 'timeout') {
    // Ambiguous: mark unknown, advance, NEVER requeue this step.
    const row = db.sms.find((r) => r.sid === sid)!;
    row.status = 'unknown';
    db.e.step++;
    db.e.next = now + 1e9;
    db.e.claimed_at = null;
    return 'timeout->unknown-no-resend';
  }

  const row = db.sms.find((r) => r.sid === sid)!;
  row.status = 'queued';
  db.e.step++;
  db.e.next = now + 1e9;
  db.e.claimed_at = null;
  return 'sent';
}

describe('adversarial: concurrent cron claim', () => {
  it('two concurrent runners → 1 send, 1 skip', async () => {
    const db = makeDb();
    const now = Date.now();
    const results = await Promise.all([
      runSend(db, 'ok', now),
      runSend(db, 'ok', now),
    ]);
    expect(results.sort()).toEqual(['sent', 'skipped']);
    expect(db.sms.filter((r) => r.status === 'queued')).toHaveLength(1);
  });
});

describe('adversarial: timeout must not double-text', () => {
  it('timeout then next tick does not send again for same step', async () => {
    const db = makeDb();
    const now = Date.now();
    expect(await runSend(db, 'timeout', now)).toBe('timeout->unknown-no-resend');

    // Next tick would try step 3 (advanced), not retry step 2.
    db.e.next = 0;
    db.e.claimed_at = null;
    const second = await runSend(db, 'ok', now + 1000);
    expect(second).toBe('sent');
    expect(db.sms.map((r) => r.sid)).toEqual([
      'campaign:E1:step:2',
      'campaign:E1:step:3',
    ]);
    // Critical: step 2 appears once
    expect(db.sms.filter((r) => r.sid.endsWith(':step:2'))).toHaveLength(1);
  });
});

describe('adversarial: crash leaves reclaimable claim', () => {
  it('stale claim can be reclaimed after CLAIM_STALE_MS', async () => {
    const db = makeDb();
    const now = Date.now();
    await expect(runSend(db, 'crash', now)).rejects.toThrow('crash');
    expect(db.e.next).toBeNull();
    expect(db.e.claimed_at).toBe(now);
    expect(db.sms[0]?.status).toBe('sending');

    // Fresh claim window — not reclaimable yet
    expect(
      claim(db.e, now + 60_000)
    ).toBe(false);

    // After stale window — reclaimable; insert-before-send sees duplicate sid → no double text
    const later = now + CLAIM_STALE_MS + 1;
    expect(claim(db.e, later)).toBe(true);
    // Simulate send path seeing existing sid
    const sid = campaignStepMessageSid(db.e.id, db.e.step);
    expect(db.sms.some((r) => r.sid === sid)).toBe(true);
    expect(classifyMessageInsertError({ code: '23505' })).toBe('duplicate');
  });
});

describe('adversarial: re-enroll ping-pong prevented', () => {
  it('reply1 switch/pause, reply2 pause/noop, reply3 does not insert again', () => {
    const campaigns = [
      { id: 'c-em', name: 'Emergency', urgency_filter: 'emergency' },
      { id: 'c-std', name: 'Standard', urgency_filter: null },
    ];
    // Missed-call enrolled Standard
    let enrollment = {
      id: 'E1',
      campaign_id: 'c-std',
      status: 'active',
    };

    // Reply 1: emergency → switch
    let d = decideReplyEnrollmentAction(enrollment, campaigns[0]);
    expect(d.action).toBe('switch');
    enrollment = { ...enrollment, campaign_id: 'c-em', status: 'active' };

    // Reply 2: still emergency → pause
    d = decideReplyEnrollmentAction(enrollment, campaigns[0]);
    expect(d).toEqual({ action: 'pause' });
    enrollment = { ...enrollment, status: 'paused' };

    // Reply 3: would have re-enrolled under old bug; now noop
    d = decideReplyEnrollmentAction(enrollment, campaigns[0]);
    expect(d).toEqual({ action: 'noop' });
  });

  it('unique lead_id: second insert is rejected (23505)', () => {
    const leads = new Set<string>();
    const insert = (leadId: string) => {
      if (leads.has(leadId)) return { error: { code: '23505' } };
      leads.add(leadId);
      return { error: null };
    };
    expect(insert('L1').error).toBeNull();
    expect(classifyMessageInsertError(insert('L1').error)).toBe('duplicate');
  });
});
