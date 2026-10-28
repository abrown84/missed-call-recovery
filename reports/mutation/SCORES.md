# Mutation scores (QC r11)

Honest score = killed+timeout / (killed+timeout+survived+no-coverage).
Suppressed-as-survived = killed+timeout / (honest denom + ignored).
Equivalents only individually in `EQUIVALENT.md`.

## Latest run (QC r11 @ `4ddf7d8`, CI run 40710905422)

| Metric | Value |
|--------|-------|
| Honest | see CI gate log (campaign-runtime **90.59%**; overall in run log) |
| Ignored | **195**/file max observed on campaign-runtime; total ≤305 ratchet |
| Gate MIN | 90 per module |
| MAX_IGNORED_PER_FILE | **200** (CI cannot loosen) |
| MAX_IGNORED_TOTAL | **320** (CI cannot loosen) |
| Ratchet BASELINE_IGNORED | **305** (CI cannot loosen) |
| ignoreStatic | **false** |
| quiet-hours-zones | Generated from libphonenumber v9.0.42 `map_data.txt`; `zonesForAreaCode` under mutate |

## mut.py one-line revert harness

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | **0** |
| NOMATCH | 1 (#47 urgency gate intentionally removed for Standard enroll) |
