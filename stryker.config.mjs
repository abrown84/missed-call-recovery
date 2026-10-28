/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  reporters: ['clear-text', 'html', 'json'],
  testRunner: 'vitest',
  // Default related:true drops DI suites; run the full vitest graph.
  vitest: { related: false },
  coverageAnalysis: 'perTest',
  // QC r7: widen mutate list (opt-out-data, campaign-logic, inbound,
  // quiet-hours-zones, missed-call). No StringLiteral/Regex exclusions;
  // no-coverage mutants count in the gate denominator. Ignored mutants
  // are disclosed as not-killed in check-mutation-scores.mjs.
  mutate: [
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
    'src/services/campaign-logic.ts',
    'src/services/db-strings.ts',
    'src/services/sms.ts',
    'src/services/opt-out.ts',
    'src/services/opt-out-data.ts',
    'src/services/inbound.ts',
    'src/services/inbound-io-plans.ts',
    'src/services/missed-call.ts',
    'src/services/missed-call-io-plans.ts',
    'src/services/reconcile-logic.ts',
    'src/services/quiet-hours.ts',
    'src/services/quiet-hours-zones.ts',
  ],
  ignoreStatic: true,
  thresholds: {
    high: 90,
    low: 60,
    break: null,
  },
  timeoutMS: 60_000,
  concurrency: 4,
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
};

export default config;
