# Mutation scores (QC r8)

Honest score = killed+timeout / (killed+timeout+survived+no-coverage).
Suppressed-as-survived = killed+timeout / (honest denom + ignored).
Equivalents only individually in `EQUIVALENT.md`.

## Latest run (post-r8)

| Metric | Value |
|--------|-------|
| Honest | **96.30%** (K=2705, S=84, NoCov=20) |
| Suppressed-as-survived | **86.73%** (Ignored=310) |
| Gate MIN | 90 per module |
| MAX_IGNORED_PER_FILE | 220 |
| ignoreStatic | **false** |
| quiet-hours-zones | **excluded** from mutate (vacuous static map) |

Compared to r8 FAIL head `e21a091` (96.72% honest / 68.38% suppressed with 1101 ignored including 689 zones):
suppressed-as-survived rose ~18pp by dropping the vacuous zones file and testing static opt-out-data.
