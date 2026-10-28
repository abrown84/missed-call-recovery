# Mutation scores (QC r6)

## mut.py one-line revert harness

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | 0 |
| NOMATCH | 1 (#47 urgency gate intentionally removed) |

See `MUT_PY_SCORES.md` / `mut-results.json`.

## Stryker (honest — no StringLiteral/Regex exclusions; no-cov in denominator)

Latest completed run (r7 @ `9c4e2b1`, before subsequent survivor-killer commits):

| File | Score (incl. no-cov) | Killed | Survived | No-cov | Ignored |
|------|---------------------:|-------:|---------:|-------:|--------:|
| send/decisions.ts | **97.73%** | 344 | 8 | 0 | 0 |
| send/machine.ts | **100%** | 188 | 0 | 0 | 22 |
| send/policy.ts | **100%** | 7 | 0 | 0 | 6 |
| campaign-decisions.ts | **91.50%** | 140 | 7 | 6 | 0 |
| campaign-io-plans.ts | **100%** | 31 | 0 | 0 | 0 |
| db-strings.ts | **100%** | 4 | 0 | 0 | 29 |
| quiet-hours.ts | **96.15%** | 100 | 0 | 4 | 71 |
| reconcile-logic.ts | **97.10%** | 134 | 4 | 0 | 0 |
| sms.ts | **92.19%** | 118 | 4 | 6 | 5 |
| opt-out.ts | 87.50% | 112 | 15 | 1 | 12 |
| send/index.ts | 54.46% | 183 | 109 | 44 | 2 |
| campaigns-impl.ts | 34.82% | 187 | 224 | 126 | 53 |
| campaigns.ts | n/a (barrel; 0 mutants) | — | — | — | — |

Target ≥90% every file. Follow-up commits add gate/dispatch DI killers + opt-out equivalents + enroll/switch error-path coverage; re-run pending.

Equivalent mutants: `EQUIVALENT.md` (individually justified only).
