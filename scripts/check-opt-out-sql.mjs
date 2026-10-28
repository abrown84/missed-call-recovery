#!/usr/bin/env node
/**
 * Diff migration 003 STOP backfill IN lists vs opt-out-data.ts (QC r8 P1-3).
 * Exit 1 on mismatch. Generate lists with the same sqlQuotedList helper.
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migPath = join(root, 'supabase/migrations/003_campaign_idempotency.sql');

// Prefer tsx to load TS module exports.
const probe = `
import {
  optOutBackfillExactList,
  optOutBackfillCompactList,
  sqlQuotedList,
} from './src/services/opt-out-data.ts';
const exact = sqlQuotedList(optOutBackfillExactList());
const compact = sqlQuotedList(optOutBackfillCompactList());
process.stdout.write(JSON.stringify({ exact, compact }));
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
const { exact, compact } = JSON.parse(r.stdout.trim());
const sql = readFileSync(migPath, 'utf8');

function extractInList(label, haystack, afterMarker) {
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
  // Normalize whitespace for compare
  return inner
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

const exactSql = extractInList(
  'exact',
  sql,
  'opt_out_normalize_body(m.body) IN'
);
const compactSql = extractInList(
  'compact',
  sql,
  'opt_out_compact_body(opt_out_normalize_body(m.body)) IN'
);

const expectedExact = exact.replace(/\s+/g, ' ').trim();
const expectedCompact = compact.replace(/\s+/g, ' ').trim();

function tokenize(list) {
  return new Set(
    list
      .split(/',\s*'/)
      .map((s) => s.replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'"))
  );
}

const exA = tokenize(exactSql);
const exB = tokenize(expectedExact);
const cA = tokenize(compactSql);
const cB = tokenize(expectedCompact);

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

if (!sql.includes('opt_out_normalize_body')) {
  console.error('Migration missing opt_out_normalize_body()');
  failed = true;
}
if (!sql.includes("normalize(btrim(raw), NFKC)")) {
  console.error('Migration missing NFKC normalize (mut.py #25 target)');
  failed = true;
}

if (failed) {
  console.error('\nopt-out SQL check FAILED. Update 003 lists from opt-out-data.ts.');
  process.exit(1);
}
console.log(
  `opt-out SQL check OK (exact=${exA.size}, compact=${cA.size})`
);
