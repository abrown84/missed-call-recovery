/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  reporters: ['clear-text', 'html', 'json'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/services/send/machine.ts',
    'src/services/send/policy.ts',
    'src/services/reconcile-logic.ts',
    'src/services/opt-out.ts',
    'src/services/quiet-hours.ts',
  ],
  // Reason-string / punctuation-regex mutants are largely equivalent for our
  // action-level assertions; focus on control-flow kills.
  mutator: {
    excludedMutations: ['StringLiteral', 'Regex'],
  },
  ignoreStatic: true,
  thresholds: {
    high: 90,
    low: 90,
    break: null, // per-module gate enforced by scripts/check-mutation-scores.mjs
  },
  timeoutMS: 60_000,
  concurrency: 4,
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
};

export default config;
