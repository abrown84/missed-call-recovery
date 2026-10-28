#!/usr/bin/env node
/**
 * Diff migration 003 STOP backfill IN lists vs opt-out-data (QC r8 P1-3).
 * Exit 1 on mismatch. Also asserts mut.py #22/#25/#26 string needles.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migPath = join(root, 'supabase/migrations/003_campaign_idempotency.sql');

const probe = `
import {
  buildOptOutBackfillInLists,
  buildOptOutConfusableTranslate,
} from './src/services/opt-out-sql.ts';
const lists = buildOptOutBackfillInLists();
const conf = buildOptOutConfusableTranslate();
process.stdout.write(JSON.stringify({ ...lists, conf }));
`;

const r = spawnSync('npx', ['tsx', '-e', probe], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 4 * 1024 * 1024,
});
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}
const { exact, compact, conf } = JSON.parse(r.stdout.trim());
const sql = readFileSync(migPath, 'utf8');

function extractInList(haystack, afterMarker) {
  const start = haystack.indexOf(afterMarker);
  if (start < 0) {
    throw new Error(`Marker not found: ${afterMarker}`);
  }
  const from = haystack.indexOf('IN (', start);
  const open = haystack.indexOf('(', from);
  let depth = 0;
  let end = open;
  for (; end < haystack.length; end++) {
    if (haystack[end] === '(') depth++;
    else if (haystack[end] === ')') {
      depth--;
      if (depth === 0) break;
    }
  }
  const inner = haystack.slice(open + 1, end);
  return inner
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

const exactSql = extractInList(sql, 'n.norm IN');
const compactSql = extractInList(sql, 'opt_out_compact_body(n.norm) IN');

function tokenize(list) {
  return new Set(
    list
      .split(/',\s*'/)
      .map((s) => s.replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'"))
  );
}

const exA = tokenize(exactSql);
const exB = tokenize(exact.replace(/\s+/g, ' ').trim());
const cA = tokenize(compactSql);
const cB = tokenize(compact.replace(/\s+/g, ' ').trim());

function diffSets(a, b, name) {
  const missing = [...b].filter((x) => !a.has(x));
  const extra = [...a].filter((x) => !b.has(x));
  if (missing.length || extra.length) {
    console.error(`${name} mismatch:`);
    if (missing.length) console.error('  missing from SQL:', missing);
    if (extra.length) console.error('  extra in SQL:', extra);
    return true;
  }
  return false;
}

let failed = false;
failed = diffSets(exA, exB, 'EXACT IN list') || failed;
failed = diffSets(cA, cB, 'COMPACT IN list') || failed;

// mut.py #25 — full NFKC sandwich on the backfill LATERAL (m.body)
if (
  !sql.includes(
    'normalize(opt_out_finish_normalized(normalize(btrim(m.body), NFKC)), NFKC)'
  )
) {
  console.error(
    'Migration missing normalize(opt_out_finish_normalized(normalize(btrim(m.body), NFKC)), NFKC) (mut.py #25 needle)'
  );
  failed = true;
}

// mut.py #26 — compact STOPPLEASE needle
if (
  !sql.includes("'PLEASESTOP', 'STOPPLEASE', 'STOPIT', 'STOPPLS',")
) {
  console.error(
    "Migration missing 'PLEASESTOP', 'STOPPLEASE', 'STOPIT', 'STOPPLS', (mut.py #26)"
  );
  failed = true;
}

// mut.py #22 — 2nd ON CONFLICT is STOP backfill
const onConflictMatches = sql.match(
  /ON CONFLICT \(business_id, phone\) DO NOTHING;/g
);
if (!onConflictMatches || onConflictMatches.length < 2) {
  console.error(
    'Migration needs ≥2× ON CONFLICT (business_id, phone) DO NOTHING; (mut.py #22)'
  );
  failed = true;
}

if (!sql.includes('opt_out_finish_normalized')) {
  console.error('Migration missing opt_out_finish_normalized()');
  failed = true;
}
if (!sql.includes('opt_out_compact_body')) {
  console.error('Migration missing opt_out_compact_body()');
  failed = true;
}

// Confusable translate pairs embedded in migration
if (!sql.includes(conf.from) || !sql.includes(conf.to)) {
  console.error(
    'Migration confusable translate() from/to out of sync with CONFUSABLES'
  );
  failed = true;
}

if (failed) {
  console.error(
    '\nopt-out SQL check FAILED. Run `node scripts/generate-opt-out-sql.mjs` and update 003.'
  );
  process.exit(1);
}
console.log(
  `opt-out SQL check OK (exact=${exA.size}, compact=${cA.size}; mut.py #22/#25/#26 needles present)`
);
