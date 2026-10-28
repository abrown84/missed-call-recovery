/**
 * QC r8 P1-3: run REAL migration 003 opt-out normalize + IN lists in PGlite
 * over the shared corpus (not TS↔TS parity).
 */
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { classifyOptOut, wouldBackfillSuppress } from './opt-out';
import { NEGATIVE_SERVICE_REPLIES } from './opt-out.r7.test';

/** Cases SQL previously under-suppressed (QC r8). */
const MUST_SUPPRESS = [
  '"STOP"',
  '“Stop”',
  'STOP 🛑',
  'STOP!!🙏',
  'QUIT 🙂',
  'S-T-O-P',
  'STOP\u200b',
  'ST\u039FP', // Greek capital omicron
  'end :)',
  'STOP',
  'STOP STOP',
  'END END',
  'STOP PLEASE',
  'S T O P',
  'St0p',
  'ST\u03BFP', // Greek lowercase omicron
];

function stripUnsupported(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '')
    .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, '');
}

/** Extract the exact/compact IN (...) bodies from the migration INSERT. */
function extractMigrationInLists(sql: string): {
  exact: string;
  compact: string;
} {
  function extract(afterMarker: string): string {
    const start = sql.indexOf(afterMarker);
    if (start < 0) throw new Error(`Marker not found: ${afterMarker}`);
    const from = sql.indexOf('IN (', start);
    const open = sql.indexOf('(', from);
    let depth = 0;
    let end = open;
    for (; end < sql.length; end++) {
      if (sql[end] === '(') depth++;
      else if (sql[end] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    return sql.slice(open + 1, end);
  }
  return {
    exact: extract('n.norm IN'),
    compact: extract('opt_out_compact_body(n.norm) IN'),
  };
}

function backfillPredicateSql(lists: {
  exact: string;
  compact: string;
}): string {
  return `(
    opt_out_normalize_body($1) IN (${lists.exact})
    OR opt_out_compact_body(opt_out_normalize_body($1)) IN (${lists.compact})
  )`;
}

async function bootFunctions(): Promise<{
  db: PGlite;
  lists: { exact: string; compact: string };
}> {
  const db = new PGlite();
  const forward = readFileSync(
    join(process.cwd(), 'supabase/migrations/003_campaign_idempotency.sql'),
    'utf8'
  );
  const start = forward.indexOf(
    'CREATE OR REPLACE FUNCTION opt_out_finish_normalized'
  );
  const end = forward.indexOf(
    'INSERT INTO sms_suppressions (business_id, phone, reason)'
  );
  if (start < 0 || end < 0) {
    throw new Error('Could not locate opt_out SQL functions in migration 003');
  }
  await db.exec(forward.slice(start, end));
  return { db, lists: extractMigrationInLists(forward) };
}

describe('migration 003 SQL normalizer parity (PGlite)', () => {
  it('suppresses the QC r8 under-suppression corpus', async () => {
    const { db, lists } = await bootFunctions();
    const pred = backfillPredicateSql(lists);
    for (const body of MUST_SUPPRESS) {
      const app = wouldBackfillSuppress(body);
      expect(app, `app wouldBackfillSuppress(${JSON.stringify(body)})`).toBe(
        true
      );
      const r = await db.query<{ n: string; c: string }>(
        `SELECT opt_out_normalize_body($1) AS n,
                opt_out_compact_body(opt_out_normalize_body($1)) AS c`,
        [body]
      );
      const n = r.rows[0].n;
      const c = r.rows[0].c;
      const hit = await db.query<{ ok: boolean }>(
        `SELECT ${pred} AS ok`,
        [body]
      );
      expect(
        hit.rows[0].ok,
        `SQL suppress ${JSON.stringify(body)} (n=${n} c=${c})`
      ).toBe(true);
    }
  }, 60_000);

  it('does not suppress negative service replies', async () => {
    const { db, lists } = await bootFunctions();
    const pred = backfillPredicateSql(lists);
    for (const body of NEGATIVE_SERVICE_REPLIES.slice(0, 40)) {
      expect(classifyOptOut(body).kind, body).not.toBe('opt_out');
    }
    for (const body of [
      'Can you come by end of day?',
      'I need to cancel and reschedule to Friday',
      'The leak stopped but came back',
      'Weekend works',
    ]) {
      const hit = await db.query<{ ok: boolean }>(
        `SELECT ${pred} AS ok`,
        [body]
      );
      expect(hit.rows[0].ok, `must NOT suppress ${body}`).toBe(false);
      expect(wouldBackfillSuppress(body), body).toBe(false);
    }
  }, 60_000);

  it('full migration backfill suppresses quoted STOP on a seeded row', async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid
        AS $$ SELECT gen_random_uuid() $$ LANGUAGE sql;
    `);
    await db.exec(
      stripUnsupported(
        readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8')
      )
    );
    await db.exec(
      stripUnsupported(
        readFileSync(
          join(process.cwd(), 'supabase/migrations/001_campaigns.sql'),
          'utf8'
        )
      )
    );
    await db.exec(
      stripUnsupported(
        readFileSync(
          join(process.cwd(), 'supabase/migrations/002_secure_rls.sql'),
          'utf8'
        )
      )
    );
    await db.exec(`
      ALTER TABLE sms_messages DROP CONSTRAINT IF EXISTS sms_messages_message_sid_key;
      ALTER TABLE campaign_enrollments DROP CONSTRAINT IF EXISTS campaign_enrollments_lead_id_campaign_id_key;
      INSERT INTO businesses (id, name, phone) VALUES
        ('11111111-1111-4111-8111-111111111111', 'Acme', '+15551234567');
      INSERT INTO missed_calls (id, business_id, caller_phone, call_sid) VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', '+15559876543', 'c1');
      INSERT INTO leads (id, business_id, missed_call_id, caller_phone) VALUES
        ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5559876543');
      INSERT INTO sms_messages (lead_id, direction, body, message_sid, sent_at)
      VALUES ('44444444-4444-4444-8444-444444444444', 'inbound', '"STOP"', 'q1', NOW());
    `);
    await db.exec(
      stripUnsupported(
        readFileSync(
          join(process.cwd(), 'supabase/migrations/003_campaign_idempotency.sql'),
          'utf8'
        )
      )
    );
    const suppress = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM sms_suppressions WHERE reason = 'opt_out_backfill'`
    );
    expect(suppress.rows[0].n).toBeGreaterThanOrEqual(1);
  }, 90_000);
});
