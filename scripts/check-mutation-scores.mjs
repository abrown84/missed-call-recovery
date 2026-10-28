#!/usr/bin/env node
/**
 * Enforce ≥90% mutation score per targeted module (QC r5 B).
 * Reads reports/mutation/mutation.json from the last `stryker run`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const REPORT = join(process.cwd(), 'reports/mutation/mutation.json');
const MIN = 90;
const TARGETS = [
  'src/services/send/machine.ts',
  'src/services/send/policy.ts',
  'src/services/reconcile-logic.ts',
  'src/services/opt-out.ts',
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
  const tested = mutants.filter((m) =>
    ['Killed', 'Timeout', 'Survived'].includes(m.status)
  ).length;
  const score = tested === 0 ? 100 : (100 * detected) / tested;
  rows.push({ path, score, detected, tested, survived: tested - detected });
  if (score < MIN) failed = true;
}

console.log('Mutation scores (detected / tested survivors excluded from no-cov):');
for (const r of rows) {
  const mark = r.score >= MIN ? 'OK' : 'FAIL';
  console.log(
    `  [${mark}] ${r.path}: ${r.score.toFixed(2)}% ` +
      `(killed+timeout=${r.detected}, survived=${r.survived}, tested=${r.tested})`
  );
}

if (failed) {
  console.error(`\nMutation gate failed: need ≥${MIN}% per module.`);
  process.exit(1);
}
console.log(`\nAll targeted modules ≥${MIN}%.`);
