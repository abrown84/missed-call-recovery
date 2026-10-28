# Mutation scores (QC r6)

## mut.py one-line revert harness

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | 0 |
| NOMATCH | 1 (#47 urgency gate intentionally removed) |

See `MUT_PY_SCORES.md` / `mut-results.json`.

## Stryker (honest — no StringLiteral/Regex exclusions; no-cov in denominator)

### r9 @ `14922a4` (enroll-plan + reconcile-tally; before send-io-plans / reply-plan)

| File | Score (incl. no-cov) | Killed | Survived | No-cov | Ignored |
|------|---------------------:|-------:|---------:|-------:|--------:|
| send/machine.ts | **100%** | 188 | 0 | 0 | 22 |
| send/policy.ts | **100%** | 7 | 0 | 0 | 6 |
| send/reconcile-tally.ts | **100%** | 73 | 0 | 0 | 0 |
| campaign-io-plans.ts | **100%** | 44 | 0 | 0 | 0 |
| db-strings.ts | **100%** | 4 | 0 | 0 | 29 |
| send/decisions.ts | **98.0%** | 345 | 7 | 0 | 0 |
| reconcile-logic.ts | **97.1%** | 134 | 4 | 0 | 0 |
| quiet-hours.ts | **96.2%** | 100 | 0 | 4 | 71 |
| opt-out.ts | **94.7%** | 107 | 5 | 1 | 29 |
| sms.ts | **92.4%** | 122 | 6 | 4 | 5 |
| campaign-decisions.ts | **91.5%** | 140 | 7 | 6 | 0 |
| campaign-enroll-plan.ts | 79.8% | 83 | 14 | 7 | 0 |
| send/index.ts | 74.4% | 206 | 58 | 13 | 2 |
| campaigns-impl.ts | 46.8% | 227 | 191 | 67 | 56 |

Target ≥90% every file. Follow-up: reply-plan extract, enroll-plan killers, log CallExpression disables, send-io-plans (r10).

Equivalent mutants: `EQUIVALENT.md` (individually justified only).
