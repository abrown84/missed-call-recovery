/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  reporters: ['clear-text', 'html', 'json'],
  testRunner: 'vitest',
  // Default related:true drops DI suites; run the full vitest graph.
  vitest: { related: false },
  coverageAnalysis: 'perTest',
  // QC r6 P0: mutate the real I/O layer + opt-out. No StringLiteral/Regex
  // exclusions; no-coverage mutants count in the gate denominator.
  mutate: [
    'src/services/send/index.ts',
    'src/services/send/decisions.ts',
    'src/services/send/machine.ts',
    'src/services/send/policy.ts',
    'src/services/campaign-decisions.ts',
    'src/services/campaign-io-plans.ts',
    'src/services/campaigns.ts',
    'src/services/campaigns-impl.ts',
    'src/services/db-strings.ts',
    'src/services/sms.ts',
    'src/services/opt-out.ts',
    'src/services/reconcile-logic.ts',
    'src/services/quiet-hours.ts',
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
