/**
 * QC r8 P1-3: run REAL migration 003 opt-out normalize + IN lists in PGlite
 * over the shared corpus (not TS↔TS parity).
 */
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { classifyOptOut, wouldBackfillSuppress } from './opt-out';
import { OPT_OUT_WHOLE_MESSAGE } from './opt-out-data';
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

/** Base whole-message tokens only (exclude derived STOP STOP / END END repeats). */
function isDerivedRepeatToken(token: string): boolean {
  const parts = token.split(' ');
  return parts.length >= 2 && parts.every((p) => p === parts[0]);
}

function uniqueBaseKeywords(): string[] {
  return OPT_OUT_WHOLE_MESSAGE.filter((t) => !isDerivedRepeatToken(t));
}

function mixedCaseKeyword(k: string): string {
  return k.length === 0 ? k : k[0].toUpperCase() + k.slice(1).toLowerCase();
}

function baseKeywordCaseCorpus(): string[] {
  const extras = [`ST\u{1D6B6}P`, `QU\u{1D6B0}T`, 's\u03C4op'];
  const bodies: string[] = [...extras];
  for (const k of uniqueBaseKeywords()) {
    bodies.push(k.toLowerCase());
    bodies.push(mixedCaseKeyword(k));
  }
  return bodies;
}

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

async function bootFullMigrations(): Promise<PGlite> {
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
  `);
  return db;
}

describe('migration 003 SQL normalizer parity (PGlite)', () => {
  it('suppresses every base keyword in lowercase and mixed case (+ unicode lookalikes)', async () => {
    const { db, lists } = await bootFunctions();
    const pred = backfillPredicateSql(lists);
    for (const body of baseKeywordCaseCorpus()) {
      const app = wouldBackfillSuppress(body);
      expect(app, `app wouldBackfillSuppress(${JSON.stringify(body)})`).toBe(
        true
      );
      expect(classifyOptOut(body).kind, `classify ${JSON.stringify(body)}`).toBe(
        'opt_out'
      );
      const hit = await db.query<{ ok: boolean }>(
        `SELECT ${pred} AS ok`,
        [body]
      );
      expect(hit.rows[0].ok, `SQL suppress ${JSON.stringify(body)}`).toBe(true);
    }
  }, 120_000);

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

  it('full migration backfill suppresses lowercase stop, unsubscribe, stopall on separate phones', async () => {
    const db = await bootFullMigrations();
    const biz = '11111111-1111-4111-8111-111111111111';
    await db.exec(`
      INSERT INTO businesses (id, name, phone) VALUES
        ('${biz}', 'Acme', '+15551234567');
      INSERT INTO missed_calls (id, business_id, caller_phone, call_sid) VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${biz}', '+15551111111', 'mc1'),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '${biz}', '+15552222222', 'mc2'),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '${biz}', '+15553333333', 'mc3');
      INSERT INTO leads (id, business_id, missed_call_id, caller_phone, created_at) VALUES
        ('44444444-4444-4444-8444-444444444441', '${biz}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '+15551111111', NOW() - INTERVAL '2 days'),
        ('44444444-4444-4444-8444-444444444442', '${biz}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '+15552222222', NOW() - INTERVAL '2 days'),
        ('44444444-4444-4444-8444-444444444443', '${biz}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '+15553333333', NOW() - INTERVAL '2 days');
      INSERT INTO sms_messages (lead_id, direction, body, message_sid, sent_at) VALUES
        ('44444444-4444-4444-8444-444444444441', 'inbound', 'stop', 'b-stop', NOW()),
        ('44444444-4444-4444-8444-444444444442', 'inbound', 'unsubscribe', 'b-unsub', NOW()),
        ('44444444-4444-4444-8444-444444444443', 'inbound', 'stopall', 'b-stopall', NOW());
    `);
    await db.exec(
      stripUnsupported(
        readFileSync(
          join(process.cwd(), 'supabase/migrations/003_campaign_idempotency.sql'),
          'utf8'
        )
      )
    );
    for (const phone of ['+15551111111', '+15552222222', '+15553333333']) {
      const row = await db.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM sms_suppressions
         WHERE business_id = $1 AND phone = $2 AND reason = 'opt_out_backfill'`,
        [biz, phone]
      );
      expect(row.rows[0].n, phone).toBe(1);
    }
  }, 90_000);

  it('rollback DROP statements remove opt-out helper functions', async () => {
    const { db } = await bootFunctions();
    await db.query(`SELECT opt_out_normalize_body('STOP') AS n`);
    const rollback = readFileSync(
      join(
        process.cwd(),
        'supabase/migrations/003_campaign_idempotency_rollback.sql'
      ),
      'utf8'
    );
    const drops = rollback
      .split('\n')
      .filter((line) => line.match(/^DROP FUNCTION IF EXISTS opt_out_/));
    expect(drops.length).toBe(3);
    await db.exec(drops.join('\n'));
    await expect(
      db.query(`SELECT opt_out_normalize_body('STOP')`)
    ).rejects.toThrow();
    await expect(
      db.query(`SELECT opt_out_compact_body('STOP')`)
    ).rejects.toThrow();
    await expect(
      db.query(`SELECT opt_out_finish_normalized('STOP')`)
    ).rejects.toThrow();
  }, 60_000);

  it('full migration backfill suppresses quoted STOP on a seeded row', async () => {
    const db = await bootFullMigrations();
    await db.exec(`
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

  it('full migration LATERAL NFKC suppresses math-bold STOP (mut.py #25)', async () => {
    // Exercises the INSERT LATERAL normalize sandwich — not just opt_out_normalize_body().
    const db = await bootFullMigrations();
    const biz = '11111111-1111-4111-8111-111111111111';
    const phone = '+15554444444';
    const boldStop = 'ST\u{1D6B6}P'; // math-bold omicron — needs NFKC before translate
    await db.exec(`
      INSERT INTO businesses (id, name, phone) VALUES
        ('${biz}', 'Acme', '+15551234567');
      INSERT INTO missed_calls (id, business_id, caller_phone, call_sid) VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '${biz}', '${phone}', 'mc4');
      INSERT INTO leads (id, business_id, missed_call_id, caller_phone) VALUES
        ('44444444-4444-4444-8444-444444444445', '${biz}',
         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '${phone}');
    `);
    await db.query(
      `INSERT INTO sms_messages (lead_id, direction, body, message_sid, sent_at)
       VALUES ('44444444-4444-4444-8444-444444444445', 'inbound', $1, 'b-bold', NOW())`,
      [boldStop]
    );
    await db.exec(
      stripUnsupported(
        readFileSync(
          join(process.cwd(), 'supabase/migrations/003_campaign_idempotency.sql'),
          'utf8'
        )
      )
    );
    const row = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM sms_suppressions
       WHERE business_id = $1 AND phone = $2 AND reason = 'opt_out_backfill'`,
      [biz, phone]
    );
    expect(row.rows[0].n).toBe(1);
  }, 90_000);
});
