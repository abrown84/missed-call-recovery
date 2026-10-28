# mut.py one-line revert harness (QC r6)

| Result | Count |
|--------|------:|
| KILLED | **63** / 63 applicable |
| SURVIVED | 0 |
| NOMATCH | 1 (#47 urgency gate intentionally removed for Standard enroll) |

Retargeted at pure modules + `campaign-runtime.ts` after I/O thinning
(`decisions`, `send-io-plans`, `campaign-reconcile-plan`, DI resend signature).
