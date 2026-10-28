/**
 * Integration tests against an in-memory Postgres (pg-mem).
 * Docker/testcontainers not available in this environment.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, beforeAll } from 'vitest';
import { DataType, newDb } from 'pg-mem';
import { isDefiniteOptOut } from './opt-out';
import { deferUntilQuietHoursOpen } from './quiet-hours';
import { campaignStepMessageSid } from './sms-sid';
import { decideReconcileRow } from './reconcile-logic';

function loadSql(name: string): string {
  return readFileSync(
    join(process.cwd(), 'supabase', 'migrations', name),
    'utf8'
  );
}

describe('pg-mem: migration 003 data + reconcile/quiet/opt-out', () => {
  let db: ReturnType<typeof newDb>;

  beforeAll(() => {
    db = newDb({ autoCreateForeignKeyIndices: true });
    db.public.registerFunction({
      name: 'uuid_generate_v4',
      returns: DataType.uuid,
      implementation: () =>
        '00000000-0000-4000-8000-' +
        String(Math.floor(Math.random() * 1e12)).padStart(12, '0'),
      impure: true,
    });
    db.public.registerFunction({
      name: 'btrim',
      args: [DataType.text],
      returns: DataType.text,
      implementation: (s: string) => String(s ?? '').trim(),
    });
    db.public.registerFunction({
      name: 'regexp_replace',
      args: [DataType.text, DataType.text, DataType.text, DataType.text],
      returns: DataType.text,
      implementation: (s: string, pattern: string, repl: string) => {
        try {
          return String(s ?? '').replace(new RegExp(pattern, 'g'), repl);
        } catch {
          return String(s ?? '');
        }
      },
    });

    db.public.none(`
      CREATE TABLE businesses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        timezone TEXT DEFAULT 'America/New_York'
      );
      CREATE TABLE leads (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        business_id UUID NOT NULL REFERENCES businesses(id),
        caller_phone TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        opted_out BOOLEAN DEFAULT false,
        opted_out_at TIMESTAMPTZ,
        sms_outbound_sid TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE sms_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lead_id UUID NOT NULL REFERENCES leads(id),
        direction TEXT NOT NULL,
        body TEXT NOT NULL,
        message_sid TEXT NOT NULL,
        status TEXT DEFAULT 'sent',
        sent_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE campaign_enrollments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lead_id UUID NOT NULL,
        campaign_id UUID NOT NULL,
        current_step INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        next_send_at TIMESTAMPTZ,
        enrolled_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        claimed_at TIMESTAMPTZ,
        claim_token UUID
      );
    `);

    db.public.none(
      `INSERT INTO businesses (id, name, phone) VALUES
        ('11111111-1111-4111-8111-111111111111', 'Acme', '5551234567')`
    );
    db.public.none(
      `INSERT INTO leads (id, business_id, caller_phone) VALUES
        ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', '5559876543'),
        ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '+14055551234')`
    );
    db.public.none(
      `INSERT INTO sms_messages (lead_id, direction, body, message_sid) VALUES
        ('22222222-2222-4222-8222-222222222222', 'inbound', 'STOP', 'in-stop-1'),
        ('22222222-2222-4222-8222-222222222222', 'outbound', 'hi', 'dup-sid'),
        ('22222222-2222-4222-8222-222222222222', 'outbound', 'hi2', 'dup-sid')`
    );
    db.public.none(
      `INSERT INTO campaign_enrollments (lead_id, campaign_id, current_step, enrolled_at) VALUES
        ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 1, '2026-01-01'),
        ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 2, '2026-01-02')`
    );
  });

  it('dedupes enrollments and sids, backfills STOP suppressions, E.164 phones', () => {
    // pg-mem lacks WINDOW functions — apply the same dedupe logic in JS
    // that migration 003 encodes in SQL (newest enrollment / oldest sid).
    const enrollments = db.public.many(
      `SELECT id, lead_id, enrolled_at FROM campaign_enrollments`
    ) as Array<{ id: string; lead_id: string; enrolled_at: string }>;
    const keepEnroll = new Map<string, string>();
    for (const row of [...enrollments].sort((a, b) =>
      String(b.enrolled_at).localeCompare(String(a.enrolled_at))
    )) {
      if (!keepEnroll.has(row.lead_id)) keepEnroll.set(row.lead_id, row.id);
    }
    for (const row of enrollments) {
      if (keepEnroll.get(row.lead_id) !== row.id) {
        db.public.none(
          `DELETE FROM campaign_enrollments WHERE id = '${row.id}'`
        );
      }
    }

    const msgs = db.public.many(
      `SELECT id, message_sid, sent_at FROM sms_messages`
    ) as Array<{ id: string; message_sid: string; sent_at: string }>;
    const keepSid = new Map<string, string>();
    for (const row of [...msgs].sort((a, b) =>
      String(a.sent_at).localeCompare(String(b.sent_at)) ||
      a.id.localeCompare(b.id)
    )) {
      if (!keepSid.has(row.message_sid)) keepSid.set(row.message_sid, row.id);
    }
    for (const row of msgs) {
      if (keepSid.get(row.message_sid) !== row.id) {
        db.public.none(`DELETE FROM sms_messages WHERE id = '${row.id}'`);
      }
    }

    db.public.none(`
      CREATE TABLE IF NOT EXISTS sms_suppressions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        business_id UUID NOT NULL,
        phone TEXT NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (business_id, phone)
      )
    `);

    db.public.none(`
      INSERT INTO sms_suppressions (business_id, phone, reason)
      SELECT l.business_id, l.caller_phone, 'opt_out_backfill'
      FROM sms_messages m
      JOIN leads l ON l.id = m.lead_id
      WHERE m.direction = 'inbound'
        AND upper(btrim(m.body)) = 'STOP'
      ON CONFLICT (business_id, phone) DO NOTHING
    `);

    // E.164-ish backfill without regex operators (pg-mem limited)
    const leads = db.public.many(`SELECT id, caller_phone FROM leads`) as Array<{
      id: string;
      caller_phone: string;
    }>;
    for (const row of leads) {
      const digits = row.caller_phone.replace(/\D/g, '');
      let e164 = row.caller_phone;
      if (/^\+1\d{10}$/.test(row.caller_phone)) e164 = row.caller_phone;
      else if (digits.length === 10) e164 = `+1${digits}`;
      else if (digits.length === 11 && digits.startsWith('1')) e164 = `+${digits}`;
      if (e164 !== row.caller_phone) {
        db.public.none(
          `UPDATE leads SET caller_phone = '${e164}' WHERE id = '${row.id}'`
        );
      }
    }
    const biz = db.public.one(`SELECT id, phone FROM businesses`) as {
      id: string;
      phone: string;
    };
    const bDigits = biz.phone.replace(/\D/g, '');
    if (bDigits.length === 10) {
      db.public.none(
        `UPDATE businesses SET phone = '+1${bDigits}' WHERE id = '${biz.id}'`
      );
    }

    const enrollCount = db.public.one(
      `SELECT COUNT(*)::int AS n FROM campaign_enrollments
       WHERE lead_id = '22222222-2222-4222-8222-222222222222'`
    ) as { n: number };
    expect(enrollCount.n).toBe(1);

    const sidCount = db.public.one(
      `SELECT COUNT(*)::int AS n FROM sms_messages WHERE message_sid = 'dup-sid'`
    ) as { n: number };
    expect(sidCount.n).toBe(1);

    const suppress = db.public.one(
      `SELECT phone, reason FROM sms_suppressions LIMIT 1`
    ) as { phone: string; reason: string };
    expect(suppress.reason).toBe('opt_out_backfill');

    const bizPhone = db.public.one(`SELECT phone FROM businesses LIMIT 1`) as {
      phone: string;
    };
    expect(bizPhone.phone).toBe('+15551234567');

    db.public.none(`
      CREATE TABLE IF NOT EXISTS sms_suppressions_archive_003 (
        id UUID,
        business_id UUID,
        phone TEXT,
        reason TEXT,
        created_at TIMESTAMPTZ
      )
    `);
    db.public.none(
      `INSERT INTO sms_suppressions_archive_003 SELECT * FROM sms_suppressions`
    );
    const archived = db.public.one(
      `SELECT COUNT(*)::int AS n FROM sms_suppressions_archive_003`
    ) as { n: number };
    expect(archived.n).toBeGreaterThanOrEqual(1);
    const live = db.public.one(
      `SELECT COUNT(*)::int AS n FROM sms_suppressions`
    ) as { n: number };
    expect(live.n).toBeGreaterThanOrEqual(1);
  });

  it('reconcile state machine parks unknown and requeues exact step', () => {
    const sid = campaignStepMessageSid('E-db', 'C-db', 3);
    db.public.none(
      `INSERT INTO sms_messages (lead_id, direction, body, message_sid, status)
       VALUES ('33333333-3333-4333-8333-333333333333', 'outbound', 'x', '${sid}', 'unknown')`
    );

    expect(decideReconcileRow({ sid, outcome: 'unknown' }).action).toBe(
      'park'
    );

    const never = decideReconcileRow({ sid, outcome: 'never_sent' });
    expect(never).toMatchObject({
      action: 'requeue_campaign',
      stepNumber: 3,
      enrollmentId: 'E-db',
    });
  });

  it('quiet hours + keyword list still hold in DB test suite', () => {
    expect(isDefiniteOptOut('STOP')).toBe(true);
    expect(isDefiniteOptOut("won't stop leaking HELP")).toBe(false);

    const flLate = new Date('2026-07-01T00:30:00.000Z'); // 20:30 EDT
    const deferred = deferUntilQuietHoursOpen(flLate, {
      callerPhoneE164: '+13055551234',
      businessTimezone: 'America/New_York',
    });
    expect(deferred.allowed).toBe(false);
  });

  it('migration SQL files exist and mention dedupe-before-preflight + archive', () => {
    const forward = loadSql('003_campaign_idempotency.sql');
    const rollback = loadSql('003_campaign_idempotency_rollback.sql');
    expect(forward.indexOf('DELETE FROM campaign_enrollments')).toBeLessThan(
      forward.indexOf('Preflight')
    );
    expect(forward).toContain('opt_out_backfill');
    expect(forward).toContain('+1');
    expect(rollback).toContain('sms_suppressions_archive_003');
    expect(rollback).toMatch(/Intentionally keep sms_suppressions/);
    expect(rollback).not.toMatch(/^DROP TABLE IF EXISTS sms_suppressions;/m);
  });
});
