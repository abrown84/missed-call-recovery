#!/usr/bin/env node
/**
 * Enforce mutation scores per targeted module (QC r7).
 * Counts no-coverage mutants in the denominator (honest gate).
 * Ignored mutants are reported separately and counted as not-killed
 * in the "suppressed-as-survived" score for disclosure.
 * Reads reports/mutation/mutation.json from the last `stryker run`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const REPORT = join(process.cwd(), 'reports/mutation/mutation.json');
const MIN = Number(process.env.MUTATION_MIN ?? '90');
const TARGETS = [
  'src/services/send/index.ts',
  'src/services/send/decisions.ts',
  'src/services/send/machine.ts',
  'src/services/send/policy.ts',
  'src/services/send/reconcile-tally.ts',
  'src/services/send/send-io-plans.ts',
  'src/services/campaign-decisions.ts',
  'src/services/campaign-io-plans.ts',
  'src/services/campaign-enroll-plan.ts',
  'src/services/campaign-reply-plan.ts',
  'src/services/campaign-cron-plan.ts',
  'src/services/campaign-send-plan.ts',
  'src/services/campaign-advance-plan.ts',
  'src/services/campaign-reconcile-plan.ts',
  'src/services/campaign-send-effects.ts',
  'src/services/campaign-deps.ts',
  'src/services/campaigns.ts',
  'src/services/campaigns-impl.ts',
  'src/services/campaign-runtime.ts',
  'src/services/db-strings.ts',
  'src/services/sms.ts',
  'src/services/opt-out.ts',
  'src/services/opt-out-data.ts',
  'src/services/campaign-logic.ts',
  'src/services/inbound.ts',
  'src/services/quiet-hours.ts',
  'src/services/quiet-hours-zones.ts',
  'src/services/missed-call.ts',
  'src/services/reconcile-logic.ts',
];

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const files = report.files || {};
let failed = false;
const rows = [];
let totalKilled = 0;
let totalSurvived = 0;
let totalNoCov = 0;
let totalIgnored = 0;

for (const path of TARGETS) {
  const f = files[path];
  if (!f) {
    // Thin barrels may produce 0 mutants — treat missing as OK only for barrels.
    if (
      path.endsWith('campaigns.ts') ||
      path.endsWith('campaigns-impl.ts')
    ) {
      rows.push({
        path,
        score: 100,
        detected: 0,
        tested: 0,
        survived: 0,
        noCov: 0,
        ignored: 0,
        suppressedScore: 100,
      });
      continue;
    }
    console.error(`Missing mutation data for ${path}`);
    failed = true;
    continue;
  }
  const mutants = f.mutants || [];
  const detected = mutants.filter((m) =>
    ['Killed', 'Timeout'].includes(m.status)
  ).length;
  const survived = mutants.filter((m) => m.status === 'Survived').length;
  const noCov = mutants.filter((m) => m.status === 'NoCoverage').length;
  const ignored = mutants.filter((m) => m.status === 'Ignored').length;
  const tested = detected + survived + noCov;
  const score = tested === 0 ? 100 : (100 * detected) / tested;
  // QC r7 disclosure: ignored count as not-killed
  const suppressedDenom = tested + ignored;
  const suppressedScore =
    suppressedDenom === 0 ? 100 : (100 * detected) / suppressedDenom;
  rows.push({
    path,
    score,
    detected,
    tested,
    survived,
    noCov,
    ignored,
    suppressedScore,
  });
  totalKilled += detected;
  totalSurvived += survived;
  totalNoCov += noCov;
  totalIgnored += ignored;
  if (score < MIN) failed = true;
}

console.log(
  `Mutation scores (killed+timeout / killed+timeout+survived+no-cov) MIN=${MIN}:`
);
for (const r of rows) {
  const mark = r.score >= MIN ? 'OK' : 'FAIL';
  console.log(
    `  [${mark}] ${r.path}: ${r.score.toFixed(2)}% ` +
      `(killed+timeout=${r.detected}, survived=${r.survived}, no-cov=${r.noCov}, ignored=${r.ignored}, denom=${r.tested}; ` +
      `suppressed-as-survived=${r.suppressedScore.toFixed(1)}%)`
  );
}

const honestDenom = totalKilled + totalSurvived + totalNoCov;
const honest =
  honestDenom === 0 ? 100 : (100 * totalKilled) / honestDenom;
const suppressedDenom = honestDenom + totalIgnored;
const suppressed =
  suppressedDenom === 0 ? 100 : (100 * totalKilled) / suppressedDenom;
console.log(
  `\nOverall honest: ${honest.toFixed(2)}% (K=${totalKilled} S=${totalSurvived} NoCov=${totalNoCov})`
);
console.log(
  `Overall suppressed-as-survived: ${suppressed.toFixed(2)}% (Ignored=${totalIgnored})`
);

if (failed) {
  console.error(`\nMutation gate failed: need ≥${MIN}% per module.`);
  process.exit(1);
}
console.log(`\nAll targeted modules ≥${MIN}%.`);
