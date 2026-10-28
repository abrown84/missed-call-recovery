/**
 * PGlite: real schema.sql → 001 → 002 → 003 (QC r5 C).
 * Collision abort script is separate and never merges businesses.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

function load(pathFromRoot: string): string {
  return readFileSync(join(process.cwd(), pathFromRoot), 'utf8');
}

function stripUnsupported(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '')
    .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, '');
}

describe('PGlite: schema + 001 + 002 + 003', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid
        AS $$ SELECT gen_random_uuid() $$ LANGUAGE sql;
    `);

    await db.exec(stripUnsupported(load('supabase/schema.sql')));
    await db.exec(stripUnsupported(load('supabase/migrations/001_campaigns.sql')));
    await db.exec(stripUnsupported(load('supabase/migrations/002_secure_rls.sql')));

    // Drop uniqueness so we can seed pre-migration messy duplicates.
    await db.exec(`
      ALTER TABLE sms_messages DROP CONSTRAINT IF EXISTS sms_messages_message_sid_key;
      ALTER TABLE campaign_enrollments DROP CONSTRAINT IF EXISTS campaign_enrollments_lead_id_campaign_id_key;
    `);

    // Fixtures: STOP variants the app normalizer catches; no colliding business phones
    await db.exec(`
      INSERT INTO businesses (id, name, phone) VALUES
        ('11111111-1111-4111-8111-111111111111', 'Acme', '+15551234567');
      INSERT INTO missed_calls (id, business_id, caller_phone, call_sid) VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', '+15559876543', 'c1');
      INSERT INTO leads (id, business_id, missed_call_id, caller_phone) VALUES
        ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5559876543');
      INSERT INTO sms_messages (lead_id, direction, body, message_sid, sent_at) VALUES
        ('44444444-4444-4444-8444-444444444444', 'inbound', 'Stop.', 's1', '2026-01-02'),
        ('44444444-4444-4444-8444-444444444444', 'inbound', 'stop!', 's2', NOW()),
        ('44444444-4444-4444-8444-444444444444', 'inbound', E' unsubscribe\\n', 's3', NOW()),
        ('44444444-4444-4444-8444-444444444444', 'inbound', 'please stop texting me', 's4', NOW()),
        ('44444444-4444-4444-8444-444444444444', 'inbound', '\uFF33\uFF34\uFF2F\uFF30', 's5', NOW()),
        ('44444444-4444-4444-8444-444444444444', 'outbound', 'hi', 'dup-sid', '2026-01-01'),
        ('44444444-4444-4444-8444-444444444444', 'inbound', 'STOP', 'dup-sid', '2026-01-02');
      INSERT INTO campaign_enrollments (lead_id, campaign_id, current_step, status, enrolled_at, created_at)
      SELECT
        '44444444-4444-4444-8444-444444444444',
        id, 1, 'paused', NULL, NULL
      FROM campaigns WHERE name = 'Standard Follow-up' LIMIT 1;
      INSERT INTO campaign_enrollments (lead_id, campaign_id, current_step, status, enrolled_at, created_at)
      SELECT
        '44444444-4444-4444-8444-444444444444',
        id, 2, 'active', '2026-01-01', '2026-01-01'
      FROM campaigns WHERE name = 'Standard Follow-up' LIMIT 1;
    `);
  }, 120_000);

  it('003 adds columns, STOP-backfills variants, dedupes enrollments (no business merge)', async () => {
    const forward = load('supabase/migrations/003_campaign_idempotency.sql');
    await db.exec(forward);

    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'sms_messages'
         AND column_name IN ('reconcile_attempts','key_supported_at_send')`
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual([
      'key_supported_at_send',
      'reconcile_attempts',
    ]);

    const suppress = await db.query<{ phone: string; reason: string }>(
      `SELECT phone, reason FROM sms_suppressions`
    );
    expect(suppress.rows.some((r) => r.reason === 'opt_out_backfill')).toBe(true);
    expect(suppress.rows.every((r) => r.phone.startsWith('+1'))).toBe(true);

    const enroll = await db.query<{ n: number; status: string }>(
      `SELECT COUNT(*)::int AS n, MAX(status::text) AS status FROM campaign_enrollments
       WHERE lead_id = '44444444-4444-4444-8444-444444444444'`
    );
    expect(enroll.rows[0].n).toBe(1);
    expect(enroll.rows[0].status).toBe('active');

    const sidCount = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM sms_messages WHERE message_sid = 'dup-sid'`
    );
    expect(sidCount.rows[0].n).toBe(1);

    // Businesses were NOT merge-deleted
    const biz = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM businesses`
    );
    expect(biz.rows[0].n).toBe(1);

    expect(forward).not.toMatch(/DELETE FROM businesses/i);
  }, 60_000);

  it('abort-only collision script lists collisions and never deletes businesses', async () => {
    const abortSql = load('supabase/scripts/phone_collision_abort.sql');
    expect(abortSql).toMatch(/ABORT/i);
    expect(abortSql).not.toMatch(/DELETE FROM businesses/i);
    expect(abortSql).not.toMatch(/UPDATE leads SET business_id/i);

    // Seed a colliding pair in a fresh DB
    const db2 = new PGlite();
    await db2.exec(`
      CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid
        AS $$ SELECT gen_random_uuid() $$ LANGUAGE sql;
      CREATE TABLE businesses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT 'x'
      );
      CREATE TABLE sms_suppressions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL,
        phone TEXT NOT NULL
      );
      INSERT INTO businesses (id, phone) VALUES
        ('11111111-1111-4111-8111-111111111111', '5551234567'),
        ('11111111-1111-4111-8111-111111111112', '+15551234567');
    `);

    let threw = false;
    try {
      await db2.exec(abortSql);
    } catch (e) {
      threw = true;
      expect(String(e)).toMatch(/collision/i);
    }
    expect(threw).toBe(true);

    const still = await db2.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM businesses`
    );
    expect(still.rows[0].n).toBe(2);
  }, 60_000);
});
