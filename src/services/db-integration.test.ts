/**
 * Integration tests against PGlite (real Postgres WASM) for migration 003.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

function loadSql(name: string): string {
  return readFileSync(
    join(process.cwd(), 'supabase', 'migrations', name),
    'utf8'
  );
}

describe('PGlite: migration 003 messy data + rollback archive', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    // PGlite lacks uuid-ossp; shim uuid_generate_v4 for migration 003 DDL.
    await db.exec(`
      CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid
        AS $$ SELECT gen_random_uuid() $$ LANGUAGE sql;
      CREATE TABLE businesses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        timezone TEXT DEFAULT 'America/New_York',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id),
        caller_phone TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        opted_out BOOLEAN DEFAULT false,
        opted_out_at TIMESTAMPTZ,
        sms_outbound_sid TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE missed_calls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id),
        caller_phone TEXT NOT NULL,
        call_sid TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE sms_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL REFERENCES leads(id),
        direction TEXT NOT NULL,
        body TEXT NOT NULL,
        message_sid TEXT NOT NULL,
        status TEXT DEFAULT 'sent',
        sent_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE campaign_enrollments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL,
        campaign_id UUID NOT NULL,
        current_step INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        next_send_at TIMESTAMPTZ,
        enrolled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ,
        claimed_at TIMESTAMPTZ,
        claim_token UUID
      );
    `);

    // Messy fixtures for QC r4 #7
    await db.exec(`
      INSERT INTO businesses (id, name, phone) VALUES
        ('11111111-1111-4111-8111-111111111111', 'Acme', '5551234567'),
        ('11111111-1111-4111-8111-111111111112', 'Acme Dup', '+15551234567');
      INSERT INTO leads (id, business_id, caller_phone) VALUES
        ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', '2125559999'),
        ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '+12125559999'),
        ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', '5559876543');
      INSERT INTO sms_messages (lead_id, direction, body, message_sid, sent_at) VALUES
        ('44444444-4444-4444-8444-444444444444', 'inbound', 'STOP', 'dup-sid', '2026-01-02'),
        ('44444444-4444-4444-8444-444444444444', 'outbound', 'hi', 'dup-sid', '2026-01-01'),
        ('44444444-4444-4444-8444-444444444444', 'inbound', 'STOP?', 'stop-q', NOW());
      INSERT INTO campaign_enrollments (lead_id, campaign_id, current_step, status, enrolled_at, created_at) VALUES
        ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 'paused', NULL, NULL),
        ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, 'active', '2026-01-01', '2026-01-01');
    `);
  }, 60_000);

  it('runs real 003: STOP backfill before dedupe, E.164 merge, prefer active enrollment', async () => {
    const forward = loadSql('003_campaign_idempotency.sql');
    await db.exec(forward);

    const suppress = await db.query<{ phone: string; reason: string }>(
      `SELECT phone, reason FROM sms_suppressions ORDER BY phone`
    );
    expect(suppress.rows.length).toBeGreaterThanOrEqual(1);
    expect(suppress.rows.some((r) => r.reason === 'opt_out_backfill')).toBe(
      true
    );
    // STOP inbound survived into backfill (phone normalized)
    expect(suppress.rows.every((r) => r.phone.startsWith('+1'))).toBe(true);

    const enroll = await db.query<{ n: number; status: string }>(
      `SELECT COUNT(*)::int AS n, MAX(status) AS status FROM campaign_enrollments
       WHERE lead_id = '44444444-4444-4444-8444-444444444444'`
    );
    expect(enroll.rows[0].n).toBe(1);
    expect(enroll.rows[0].status).toBe('active');

    const sidCount = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM sms_messages WHERE message_sid = 'dup-sid'`
    );
    expect(sidCount.rows[0].n).toBe(1);
    const kept = await db.query<{ direction: string; body: string }>(
      `SELECT direction, body FROM sms_messages WHERE message_sid = 'dup-sid'`
    );
    expect(kept.rows[0].direction).toBe('inbound');
    expect(kept.rows[0].body.toUpperCase()).toContain('STOP');

    const biz = await db.query<{ n: number; phone: string }>(
      `SELECT COUNT(*)::int AS n, MAX(phone) AS phone FROM businesses`
    );
    expect(biz.rows[0].n).toBe(1);
    expect(biz.rows[0].phone).toBe('+15551234567');

    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'sms_messages'
         AND column_name IN ('reconcile_attempts','key_supported_at_send')`
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual([
      'key_supported_at_send',
      'reconcile_attempts',
    ]);
  }, 60_000);

  it('rollback archives sms_suppressions and does not DROP them', async () => {
    const rollback = loadSql('003_campaign_idempotency_rollback.sql');
    expect(rollback).toContain('sms_suppressions_archive_003');
    expect(rollback).not.toMatch(/^DROP TABLE IF EXISTS sms_suppressions;/m);

    await db.exec(rollback);

    const archived = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM sms_suppressions_archive_003`
    );
    expect(archived.rows[0].n).toBeGreaterThanOrEqual(1);

    const live = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM sms_suppressions`
    );
    expect(live.rows[0].n).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('forward SQL orders STOP backfill before sms_messages dedupe', () => {
    const forward = loadSql('003_campaign_idempotency.sql');
    const backfillAt = forward.indexOf('opt_out_backfill');
    const dedupeSmsAt = forward.indexOf(
      'DELETE FROM sms_messages sm'
    );
    expect(backfillAt).toBeGreaterThan(0);
    expect(dedupeSmsAt).toBeGreaterThan(backfillAt);
    expect(forward).toContain('NULLS LAST');
    expect(forward).toContain("status = 'active'");
    expect(forward).toContain('key_supported_at_send');
  });
});
