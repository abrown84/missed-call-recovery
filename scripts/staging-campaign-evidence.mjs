#!/usr/bin/env node
/**
 * Staging / preview evidence helper for campaign timing + urgency enrollment.
 *
 * Modes:
 * 1) Live HTTP (default): hits CRON_APP_URL webhooks + cron.
 * 2) Dry-run DB: set STAGING_EVIDENCE_MODE=dry-run-db to exercise SQL checks
 *    against DATABASE_URL / SUPABASE_DB_URL without sending SMS.
 *
 * SAFE DEFAULTS:
 * - Refuses HTTP mode unless MESSAGING_PROVIDER=dry-run (or CONFIRM_LIVE_SMS=yes).
 * - Never prints secrets; only redacts phones in logs.
 *
 * Usage (HTTP / dry-run messaging):
 *   CRON_APP_URL=https://staging.example \
 *   CRON_SECRET=... BRWN_WEBHOOK_SECRET=... STAGING_BUSINESS_PHONE=+1... \
 *   MESSAGING_PROVIDER=dry-run \
 *   node scripts/staging-campaign-evidence.mjs
 *
 * Usage (dry-run DB only — no HTTP, no SMS):
 *   STAGING_EVIDENCE_MODE=dry-run-db \
 *   DATABASE_URL=postgres://... \
 *   node scripts/staging-campaign-evidence.mjs
 */

import { resolveStagingSsl } from './staging-ssl.mjs';

const mode = (process.env.STAGING_EVIDENCE_MODE || 'http').trim().toLowerCase();

function redact(phone) {
  const d = String(phone).replace(/\D/g, '');
  return d.length >= 4 ? `***-***-${d.slice(-4)}` : '***';
}

if (mode === 'dry-run-db') {
  await runDryRunDb();
  process.exit(0);
}

const required = [
  'CRON_APP_URL',
  'CRON_SECRET',
  'BRWN_WEBHOOK_SECRET',
  'STAGING_BUSINESS_PHONE',
];

const missing = required.filter((k) => !process.env[k]?.trim());
const provider = (process.env.MESSAGING_PROVIDER || '').trim().toLowerCase();

if (missing.length) {
  console.error('Missing credentials / config for staging evidence:');
  for (const k of missing) console.error(`  - ${k}`);
  console.error(
    '\nAlso required on the target deployment: Supabase URL/keys, and MESSAGING_PROVIDER=dry-run.'
  );
  console.error(
    'Tip: STAGING_EVIDENCE_MODE=dry-run-db DATABASE_URL=… runs SQL checks without HTTP.'
  );
  process.exit(2);
}

if (provider !== 'dry-run' && process.env.CONFIRM_LIVE_SMS !== 'yes') {
  console.error(
    'Refusing to run: set MESSAGING_PROVIDER=dry-run on the target app (and locally for this check),'
  );
  console.error(
    'or CONFIRM_LIVE_SMS=yes only if you intentionally accept live SMS risk (not recommended).'
  );
  process.exit(2);
}

const base = process.env.CRON_APP_URL.replace(/\/$/, '');
const businessPhone = process.env.STAGING_BUSINESS_PHONE;
// Default: fictional 555-01xx in a *mapped* area code (213 = LA). Unmapped
// +1555… correctly fails closed as quiet_hours_unresolved — don't use it here.
const testCaller = process.env.STAGING_TEST_CALLER || '+12135550100';
const secret = process.env.BRWN_WEBHOOK_SECRET;
const cronSecret = process.env.CRON_SECRET;

async function post(path, body, bearer) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json, at: new Date().toISOString() };
}

const callId = `evidence-${Date.now()}`;
console.log(
  JSON.stringify({
    phase: 'start',
    mode: 'http',
    at: new Date().toISOString(),
    base,
    businessPhone: redact(businessPhone),
    testCaller: redact(testCaller),
  })
);

const missed = await post(
  '/api/webhooks/brwn/missed-call',
  {
    callerPhone: testCaller,
    businessPhone,
    callId,
    ringDurationSeconds: 8,
  },
  secret
);
console.log(JSON.stringify({ phase: 'missed-call', ...missed }));

const inbound = await post(
  '/api/webhooks/brwn/inbound',
  {
    from: testCaller,
    to: businessPhone,
    body: 'Emergency — basement flooding, need help right now!',
    messageId: `evidence-in-${Date.now()}`,
  },
  secret
);
console.log(JSON.stringify({ phase: 'inbound-classify-enroll', ...inbound }));

const cron1 = await post('/api/cron/campaigns', {}, cronSecret);
console.log(JSON.stringify({ phase: 'cron-immediate', ...cron1 }));

console.log(
  JSON.stringify({
    phase: 'done',
    at: new Date().toISOString(),
    note:
      'Inspect staging DB/logs for enrollment campaign name (Emergency) and next_send_at. ' +
      'For the 2-minute due test, update next_send_at to now()+2min in staging Supabase, wait, re-run cron.',
  })
);

/**
 * Dry-run against a staging Postgres URL: verify migration artifacts +
 * reconcile-related columns without sending SMS.
 */
async function runDryRunDb() {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.STAGING_DATABASE_URL?.trim();

  if (!url) {
    console.error(
      'dry-run-db requires DATABASE_URL or SUPABASE_DB_URL or STAGING_DATABASE_URL'
    );
    process.exit(2);
  }

  // Prefer pg if installed; otherwise print the SQL checklist for operators.
  let Client;
  try {
    ({ Client } = await import('pg'));
  } catch {
    console.log(
      JSON.stringify({
        phase: 'dry-run-db',
        status: 'pg_not_installed',
        checklist: [
          'SELECT COUNT(*) FROM sms_suppressions;',
          'SELECT indexname FROM pg_indexes WHERE indexname LIKE %uq_sms_messages% OR indexname LIKE %uq_campaign%;',
          'SELECT COUNT(*) FROM sms_messages WHERE status IN (\'unknown\',\'sending\');',
          'SELECT COUNT(*) FROM campaign_enrollments WHERE claim_token IS NOT NULL;',
        ],
        note: 'Install `pg` or run the checklist SQL in the staging SQL editor.',
      })
    );
    process.exit(0);
  }

  // SSL: set STAGING_PG_SSL=0/false to disable; STAGING_PG_SSL_REJECT_UNAUTHORIZED=0
  // to allow self-signed (default: rejectUnauthorized=true).
  const ssl = resolveStagingSsl(process.env);
  const client = new Client({ connectionString: url, ssl });
  await client.connect();
  try {
    const suppressions = await client.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_name = 'sms_suppressions'`
    );
    const indexes = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE indexname IN (
         'uq_sms_messages_message_sid',
         'uq_campaign_enrollments_lead_id'
       )`
    );
    const ambiguous = await client.query(
      `SELECT COUNT(*)::int AS n FROM sms_messages
       WHERE status IN ('unknown', 'sending')`
    ).catch(() => ({ rows: [{ n: null }] }));

    console.log(
      JSON.stringify({
        phase: 'dry-run-db',
        status: 'ok',
        sms_suppressions_table: suppressions.rows[0]?.n === 1,
        idempotency_indexes: indexes.rows.map((r) => r.indexname),
        ambiguous_sms_count: ambiguous.rows[0]?.n,
        at: new Date().toISOString(),
      })
    );
  } finally {
    await client.end();
  }
}
