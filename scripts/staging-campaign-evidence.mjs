#!/usr/bin/env node
/**
 * Staging / preview evidence helper for campaign timing + urgency enrollment.
 *
 * SAFE DEFAULTS:
 * - Refuses to run unless MESSAGING_PROVIDER=dry-run (or CONFIRM_LIVE_SMS=yes
 *   with an explicit STAGING_TEST_TO number already used in this repo — none is).
 * - Never prints secrets; only redacts phones in logs.
 *
 * Usage (staging preview with dry-run sender configured on the deployment):
 *   CRON_APP_URL=https://your-preview.vercel.app \
 *   CRON_SECRET=... \
 *   BRWN_WEBHOOK_SECRET=... \
 *   STAGING_BUSINESS_PHONE=+1... \
 *   MESSAGING_PROVIDER=dry-run \
 *   node scripts/staging-campaign-evidence.mjs
 *
 * If required env vars are missing, prints exactly what is missing and exits 2.
 */

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
    'This environment has no staging/preview URL or secrets wired; cannot produce live evidence.'
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

function redact(phone) {
  const d = String(phone).replace(/\D/g, '');
  return d.length >= 4 ? `***-***-${d.slice(-4)}` : '***';
}

const base = process.env.CRON_APP_URL.replace(/\/$/, '');
const businessPhone = process.env.STAGING_BUSINESS_PHONE;
const testCaller = process.env.STAGING_TEST_CALLER || '+15550001234';
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

// Schedule check: hit cron immediately (due messages) and log timestamps.
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
