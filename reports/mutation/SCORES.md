# Mutation scores (QC r9)

Honest score = killed+timeout / (killed+timeout+survived+no-coverage).
Suppressed-as-survived = killed+timeout / (honest denom + ignored).
Equivalents only individually in `EQUIVALENT.md`.

## Latest run (QC r9 @ `ddc2a43`)

| Metric | Value |
|--------|-------|
| Honest | **96.28%** (K=2740, S=84, NoCov=22) |
| Suppressed-as-survived | **86.96%** (Ignored=305) |
| Gate MIN | 90 per module |
| MAX_IGNORED_PER_FILE | 220 |
| MAX_IGNORED_TOTAL | 400 |
| ignoreStatic | **false** |
| quiet-hours-zones | `zonesForAreaCode` under mutate; static map in `quiet-hours-zones-data.ts` |

## mut.py one-line revert harness

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | **0** |
| NOMATCH | 1 (#47 urgency gate intentionally removed for Standard enroll) |
