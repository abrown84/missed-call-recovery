# Mutation scores (QC r7)

Honest Stryker scope — no StringLiteral/Regex exclusions; no-cov counted in
denominator. Equivalents only individually in `EQUIVALENT.md`.

## mut.py one-line revert harness

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | **0** |
| NOMATCH | 1 (#47 urgency gate intentionally removed for Standard enroll) |

## Stryker (full mutate list)

| Metric | Score |
|--------|------:|
| **Honest** (ignored excluded) | **96.72%** (2569 killed+timeout / 2656 tested; 67 survived; 20 no-cov) |
| **Suppressed-as-survived** (ignored counted as not-killed) | **68.38%** (2569 / 3757 incl. 1101 ignored) |

### Per-file (honest ≥90% gate — all OK)

| File | Honest | Survived | No-cov | Ignored | Suppressed-as-survived |
|------|------:|---------:|-------:|--------:|----------------------:|
| send/machine.ts | 100% | 0 | 0 | 22 | 89.5% |
| send/policy.ts | 100% | 0 | 0 | 6 | 53.8% |
| send/send-io-plans.ts | 100% | 0 | 0 | 0 | 100% |
| campaign-* plans / deps / effects | 100% | 0 | 0 | — | — |
| db-strings.ts | 100% | 0 | 0 | 33 | 10.8% |
| inbound-io-plans.ts | 100% | 0 | 0 | 0 | 100% |
| missed-call-io-plans.ts | 100% | 0 | 0 | 0 | 100% |
| opt-out-data.ts | 100% | 0 | 0 | 38 | 19.1% |
| quiet-hours-zones.ts | 100%* | 0 | 0 | 689 | 0%* |
| send/reconcile-tally.ts | 98.73% | 1 | 0 | 0 | 98.7% |
| campaign-logic.ts | 98.51% | 3 | 0 | 21 | 89.2% |
| send/decisions.ts | 98.05% | 7 | 0 | 0 | 98.1% |
| campaign-reconcile-plan.ts | 97.65% | 2 | 0 | 0 | 97.6% |
| missed-call.ts | 97.50% | 1 | 0 | 22 | 62.9% |
| inbound.ts | 97.46% | 3 | 0 | 35 | 75.2% |
| sms.ts | 97.28% | 0 | 4 | 5 | 94.1% |
| reconcile-logic.ts | 97.10% | 4 | 0 | 0 | 97.1% |
| campaign-send-plan.ts | 96.09% | 5 | 0 | 0 | 96.1% |
| send/index.ts | 95.69% | 9 | 1 | 4 | 94.1% |
| quiet-hours.ts | 95.18% | 4 | 4 | 9 | 90.3% |
| opt-out.ts | 92.86% | 7 | 0 | 17 | 79.1% |
| campaign-decisions.ts | 91.50% | 7 | 6 | 0 | 91.5% |
| campaign-runtime.ts | 90.31% | 14 | 5 | 195 | 45.3% |

\* `quiet-hours-zones.ts` produces 0 scored mutants under `ignoreStatic` (zone tables); listed for mutate-list coverage.

**Gate:** every TARGETS file ≥ **90%** honest ✅

QC r7 baseline on `ae82ebe` was **82.6%** suppressed-as-survived on a narrower scope; this run reports **68.38%** suppressed-as-survived with the widened mutate list and 1101 disclosed ignores.
