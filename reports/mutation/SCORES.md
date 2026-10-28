# Mutation scores (QC r6)

## mut.py one-line revert harness

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | 0 |
| NOMATCH | 1 (#47 urgency gate intentionally removed) |

## Stryker (honest — no StringLiteral/Regex exclusions; no-cov in denominator)

### r10 @ `66db356` (reply-plan + send-io-plans + log CallExpression disables)

| File | Score | Killed | Survived | No-cov | Ignored |
|------|------:|-------:|---------:|-------:|--------:|
| send/machine.ts | **100%** | 188 | 0 | 0 | 22 |
| send/policy.ts | **100%** | 7 | 0 | 0 | 6 |
| send/reconcile-tally.ts | **100%** | 73 | 0 | 0 | 0 |
| send/send-io-plans.ts | **100%** | 19 | 0 | 0 | 0 |
| campaign-io-plans.ts | **100%** | 44 | 0 | 0 | 0 |
| db-strings.ts | **100%** | 4 | 0 | 0 | 29 |
| send/decisions.ts | **98.0%** | 345 | 7 | 0 | 0 |
| reconcile-logic.ts | **97.1%** | 134 | 4 | 0 | 0 |
| campaign-enroll-plan.ts | **96.9%** | 95 | 3 | 0 | 0 |
| quiet-hours.ts | **96.2%** | 100 | 0 | 4 | 71 |
| opt-out.ts | **94.7%** | 107 | 5 | 1 | 29 |
| sms.ts | **92.4%** | 122 | 6 | 4 | 5 |
| campaign-decisions.ts | **91.5%** | 140 | 7 | 6 | 0 |
| campaign-reply-plan.ts | 86.0% | 43 | 3 | 4 | 0 |
| send/index.ts | 74.9% | 203 | 55 | 13 | 3 |
| campaigns-impl.ts | 50.7% | 226 | 172 | 48 | 90 |

### In flight (r11 @ `4d8ed35`)

Adds `campaign-cron-plan`, reply-plan/cron DI killers, enroll-plan equivalent disables.

Equivalents: `EQUIVALENT.md`.
