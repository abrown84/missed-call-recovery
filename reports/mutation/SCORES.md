# Mutation scores (QC r6)

## mut.py one-line revert harness

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | 0 |
| NOMATCH | 1 (#47 urgency gate intentionally removed) |

See `MUT_PY_SCORES.md` / `mut-results.json`.

## Stryker (honest gate — no StringLiteral/Regex exclusions; no-cov in denominator)

Scores below are from the latest completed run. Re-run after DI/pure-decision thinning;
target ≥90% on every mutate-list file.

| File | Score (incl. no-cov) | Notes |
|------|---------------------:|-------|
| send/decisions.ts | ≥90% | pure |
| send/machine.ts | ≥90% | pure |
| send/policy.ts | 100% | pure |
| campaign-decisions.ts | ≥90% | pure |
| quiet-hours.ts | ≥90% | pure |
| reconcile-logic.ts | ≥90% | pure |
| db-strings.ts | n/a (0 mutants; ignoreStatic) | constants |
| campaigns.ts | n/a (barrel re-exports) | thin |
| sms.ts | WIP → ≥90% | DI + logger + deferred pure |
| send/index.ts | WIP → ≥90% | DI + COL constants |
| opt-out.ts | WIP → ≥90% | property + equivalents |
| campaigns-impl.ts | WIP → ≥90% | DI mocks + COL constants |

Equivalent mutants: see `EQUIVALENT.md` (individually justified).
