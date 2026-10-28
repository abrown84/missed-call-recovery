# Mutation scores (QC r6)

Honest Stryker scope — no StringLiteral/Regex exclusions; no-cov counted in
denominator. Equivalents only individually in `EQUIVALENT.md`.

## mut.py one-line revert harness

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | 0 |
| NOMATCH | 1 (#47 urgency gate intentionally removed for Standard enroll) |

## Stryker r18b @ `4b66029`

| File | Score | Killed | Survived | No-cov | Ignored |
|------|------:|-------:|---------:|-------:|--------:|
| send/machine.ts | **100%** | 188 | 0 | 0 | 22 |
| send/policy.ts | **100%** | 7 | 0 | 0 | 6 |
| send/send-io-plans.ts | **100%** | 19 | 0 | 0 | 0 |
| campaign-advance-plan.ts | **100%** | 23 | 0 | 0 | 0 |
| campaign-cron-plan.ts | **100%** | 30 | 0 | 0 | 0 |
| campaign-enroll-plan.ts | **100%** | 94 | 0 | 0 | 4 |
| campaign-io-plans.ts | **100%** | 53 | 0 | 0 | 0 |
| campaign-reply-plan.ts | **100%** | 49 | 0 | 0 | 1 |
| campaign-send-effects.ts | **100%** | 16 | 0 | 0 | 0 |
| campaign-deps.ts | **100%** | 6 | 0 | 0 | 1 |
| db-strings.ts | **100%** | 4 | 0 | 0 | 29 |
| send/reconcile-tally.ts | **98.73%** | 78 | 1 | 0 | 0 |
| send/decisions.ts | **98.05%** | 352 | 7 | 0 | 0 |
| campaign-reconcile-plan.ts | **97.65%** | 83 | 2 | 0 | 0 |
| reconcile-logic.ts | **97.10%** | 134 | 4 | 0 | 0 |
| sms.ts | **96.99%** | 129 | 0 | 4 | 5 |
| quiet-hours.ts | **96.15%** | 100 | 0 | 4 | 71 |
| campaign-send-plan.ts | **96.09%** | 123 | 5 | 0 | 0 |
| send/index.ts | **95.56%** | 215 | 9 | 1 | 4 |
| opt-out.ts | **94.69%** | 107 | 5 | 1 | 29 |
| campaign-decisions.ts | **91.50%** | 140 | 7 | 6 | 0 |
| campaign-runtime.ts | **90.77%** | 177 | 13 | 5 | (wrappers + log-only + justified) |
| campaigns.ts / campaigns-impl.ts | n/a (thin re-export barrels; 0 scored mutants) | | | | |

**Overall:** 96.64% (2127 killed / 53 survived / 21 no-cov).

**Gate:** every mutate-list file ≥ **90%** ✅
