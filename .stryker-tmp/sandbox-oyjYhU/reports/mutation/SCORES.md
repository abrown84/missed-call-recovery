# Mutation scores (QC r6)

## mut.py one-line revert harness

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | 0 |
| NOMATCH | 1 (#47 urgency gate intentionally removed) |

See `MUT_PY_SCORES.md` / `mut-results.json`.

## Stryker (honest gate — no StringLiteral/Regex exclusions; no-cov in denominator)

| File | Score (incl. no-cov) | Covered score | Killed | Survived | No-cov |
|------|---------------------:|--------------:|-------:|---------:|-------:|
| send/index.ts | 26.42% | 48.21% | 135 | 145 | 231 |
| send/machine.ts | 70.00% | 76.24% | 154 | 48 | 18 |
| send/policy.ts | 80.00% | 80.00% | 4 | 1 | 0 |
| campaigns.ts | 9.98% | 33.47% | 81 | 161 | 570 |
| sms.ts | 10.63% | 50.00% | 22 | 22 | 163 |
| opt-out.ts | 61.84% | 63.51% | 94 | 54 | 4 |
| reconcile-logic.ts | 91.30% | 91.97% | 126 | 11 | 1 |
| quiet-hours.ts | 86.36% | 92.23% | 95 | 8 | 7 |

I/O-layer scores are low with StringLiteral/Regex enabled and no-cov counted — disclosed. Caller-level mut.py reverts are all killed.
