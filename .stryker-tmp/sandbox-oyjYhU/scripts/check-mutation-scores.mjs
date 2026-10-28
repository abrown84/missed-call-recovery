#!/usr/bin/env node
// @ts-nocheck
/**
 * Enforce mutation scores per targeted module (QC r6).
 * Counts no-coverage mutants in the denominator (honest gate).
 * Reads reports/mutation/mutation.json from the last `stryker run`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const REPORT = join(process.cwd(), 'reports/mutation/mutation.json');
const MIN = Number(process.env.MUTATION_MIN ?? '50'); // I/O layer starts lower; raise over time
const TARGETS = [
  'src/services/send/index.ts',
  'src/services/send/machine.ts',
  'src/services/send/policy.ts',
  'src/services/campaigns.ts',
  'src/services/sms.ts',
  'src/services/opt-out.ts',
  'src/services/reconcile-logic.ts',
  'src/services/quiet-hours.ts',
];

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const files = report.files || {};
let failed = false;
const rows = [];

for (const path of TARGETS) {
  const f = files[path];
  if (!f) {
    console.error(`Missing mutation data for ${path}`);
    failed = true;
    continue;
  }
  const mutants = f.mutants || [];
  const detected = mutants.filter((m) =>
    ['Killed', 'Timeout'].includes(m.status)
  ).length;
  // QC r6: no-coverage counts in the denominator
  const tested = mutants.filter((m) =>
    ['Killed', 'Timeout', 'Survived', 'NoCoverage'].includes(m.status)
  ).length;
  const survived = mutants.filter((m) => m.status === 'Survived').length;
  const noCov = mutants.filter((m) => m.status === 'NoCoverage').length;
  const score = tested === 0 ? 100 : (100 * detected) / tested;
  rows.push({ path, score, detected, tested, survived, noCov });
  if (score < MIN) failed = true;
}

console.log(
  'Mutation scores (killed+timeout / killed+timeout+survived+no-cov):'
);
for (const r of rows) {
  const mark = r.score >= MIN ? 'OK' : 'FAIL';
  console.log(
    `  [${mark}] ${r.path}: ${r.score.toFixed(2)}% ` +
      `(killed+timeout=${r.detected}, survived=${r.survived}, no-cov=${r.noCov}, denom=${r.tested})`
  );
}

if (failed) {
  console.error(`\nMutation gate failed: need ≥${MIN}% per module.`);
  process.exit(1);
}
console.log(`\nAll targeted modules ≥${MIN}%.`);
