# Mutation scores (QC r10)

Honest score = killed+timeout / (killed+timeout+survived+no-coverage).
Suppressed-as-survived = killed+timeout / (honest denom + ignored).
Equivalents only individually in `EQUIVALENT.md`.

## Latest run (QC r10 @ `b5a2899`, CI run 40696546486)

| Metric | Value |
|--------|-------|
| Honest | **96.39%** (K=2749, S=81, NoCov=22) |
| Suppressed-as-survived | **87.08%** (Ignored=305) |
| Gate MIN | 90 per module |
| MAX_IGNORED_PER_FILE | **200** |
| MAX_IGNORED_TOTAL | **320** |
| Ratchet BASELINE_IGNORED | **305** |
| ignoreStatic | **false** |
| quiet-hours-zones | `zonesForAreaCode` under mutate; static map in `quiet-hours-zones-data.ts` (out of mutate; golden pin) |

## mut.py one-line revert harness

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | **0** |
| NOMATCH | 1 (#47 urgency gate intentionally removed for Standard enroll) |
