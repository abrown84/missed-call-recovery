# mut.py one-line revert harness (QC r7)

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | **0** |
| NOMATCH | 1 (#47 urgency gate intentionally removed for Standard enroll) |

Retargets vs pre-r7:
- #19 compact-form now mutates the four-arm whole-message OR (incl. collapsed)
- #22 ON CONFLICT targets STOP-backfill INSERT (occurrence 2)
