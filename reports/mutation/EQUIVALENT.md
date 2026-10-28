# Equivalent mutants (justified)

Individually justified true equivalents — behavior identical for all inputs in
the function’s domain. Prefer tests that kill non-equivalents; only list
mutants here when no test can distinguish original from replacement.

### policy-sends-enabled-default-true-vs-empty

- file: `src/services/send/policy.ts` / mutator: StringLiteral / line: 16 (pre-refactor)
- original → replacement: `?? 'true'` → `?? ''`
- justification: `ENABLED_VALUES` contains both `''` and `'true'`, so a missing
  env var coalesced to either string still enables sends. Refactored to
  `if (env.SENDS_ENABLED === undefined) return true` so the equivalent
  StringLiteral mutant no longer exists.

### machine-park-delay-gt-vs-gte

- file: `src/services/send/machine.ts` / mutator: EqualityOperator / line: 57
- original → replacement: `n > 0` → `n >= 0`
- justification: when `n === 0`, both branches set `exp = Math.floor(0) === 0`
  (mutant takes the ternary true branch; original takes the `: 0` branch). Same
  `PARK_BASE_MS` result. Disabled in source.

### machine-case-error-vs-default

- file: `src/services/send/machine.ts` / mutator: StringLiteral / ConditionalExpression / line: `case 'error'`
- original → replacement: empty case label / remove case
- justification: `case 'error'` shares its body with `default`, so dropping the
  label still routes `type: 'error'` to the same `send_error` park decision.
  Disabled in source.

### machine-case-unknown-vs-default

- file: `src/services/send/machine.ts` / mutator: StringLiteral / ConditionalExpression / line: `case 'unknown'`
- original → replacement: empty case label / remove case
- justification: `case 'unknown'` shares its body with `default` (park / max-attempts).
  Disabled in source.

### machine-status-coalesce-empty-vs-filler

- file: `src/services/send/machine.ts` / mutator: StringLiteral / `String(status ?? '')`
- original → replacement: `''` → `'Stryker was here!'`
- justification: neither the empty string nor the filler appears in
  FAILED/CONFIRMED/ambiguous token sets after `toLowerCase()`, so nullish
  inputs still return false / non-match. Disabled in source.

### machine-classify-recovery-redundant-pending

- file: `src/services/send/machine.ts` / mutator: various / lines: 231–238 (pre-refactor)
- original → replacement: remove `deferred` / `isAmbiguousStatus || needs_review || failed` pending branches
- justification: every remaining path after confirmed/abandoned already returned
  `'pending'` via the final fallthrough, so those branches were dead for
  observable behavior. Refactored to a single `return 'pending'`.

### machine-status-guards-empty-early-return

- file: `src/services/send/machine.ts` / mutator: ConditionalExpression / lines: 202, 207, 212 (pre-refactor)
- original → replacement: `if (!status) return false` → `if (false)`
- justification: for `string | null | undefined`, falsy inputs become
  `''` / `'null'` / `'undefined'` under `String(...)` and are absent from the
  status sets / ambiguous OR-chain, so the early return matched the fallthrough.
  Refactored to `String(status ?? '')` without a separate guard.

### quiet-hours-tz-cache-hit

- file: `src/services/quiet-hours.ts` / mutator: ConditionalExpression / line: 24
- original → replacement: `if (VALID_TZ_CACHE.has(tz))` → `if (false)`
- justification: skipping the cache only re-runs the same `Intl` probe; return
  value is unchanged. Disabled in source.

### quiet-hours-lead-tz-empty-coalesce

- file: `src/services/quiet-hours.ts` / mutator: StringLiteral / line: 60
- original → replacement: `|| ''` → `|| 'Stryker was here!'`
- justification: both the empty string and the filler fail `isValidTimeZone`, so
  resolution falls through identically. Disabled in source.

### quiet-hours-filter-identity

- file: `src/services/quiet-hours.ts` / mutator: MethodExpression / line: 72
- original → replacement: `mapped.filter(isValidTimeZone)` → `mapped`
- justification: `AREA_CODE_ZONES` only contains real IANA zone ids, so the
  filter is an identity on production data. Disabled in source.

### quiet-hours-zones-length-one

- file: `src/services/quiet-hours.ts` / mutator: ConditionalExpression / line: 77
- original → replacement: `zones.length === 1` → `true`
- justification: after a successful map lookup, `zones.length === 0` is
  unreachable (filter identity + non-empty map entries), and `length > 1` is
  handled above — so forcing the `=== 1` branch true does not change outcomes.
  Disabled in source.

### opt-out-compact-set-redundant-with-contains

- file: `src/services/opt-out.ts` / mutator: ConditionalExpression / line: OPT_OUT_COMPACT.has
- original → replacement: skip compact-set short-circuit
- justification: every `OPT_OUT_COMPACT` entry is also recognized by
  `containsOptOutKeyword` (exact stem or the STOP|QUIT|… compact regex), so
  dropping the short-circuit still yields `opt_out`. Disabled in source.

### opt-out-ambiguous-stop-guard

- file: `src/services/opt-out.ts` / mutator: ConditionalExpression,StringLiteral / line: `normalized !== 'STOP'`
- original → replacement: force true / empty needle
- justification: `STOP` already returns via `OPT_OUT_EXACT` before the
  AMBIGUOUS loop, so the guard is unreachable. Disabled in source.

### opt-out-compact-or-arms-covered-by-regex

- file: `src/services/opt-out.ts` / mutator: LogicalOperator,MethodExpression,ArithmeticOperator,… / compact OR-chain (pre-refactor)
- original → replacement: drop start/end/eq/dup arms or swap methods
- justification: for the current keyword stems, `/STOP|QUIT|END|CANCEL|REVOKE|UNSUBSCRIBE|OPTOUT/`
  already accepts any compact string those arms would accept; inner
  `compact.includes(kw)` repeats the outer guard. Refactored to the regex only.

### log-only-console-stringliterals

Individually disabled `StringLiteral` mutants on `console.log` /
`console.error` / `console.warn` messages. Replacement only changes
operator-visible log text; return values, DB writes, and control flow
are unchanged. Each site annotated `// Stryker disable next-line StringLiteral`.

- src/services/campaigns.ts:86: `console.error('Failed to fetch lead for enrollment:', leadEr`
- src/services/campaigns.ts:101: `console.warn('No active campaigns found for enrollment');
`
- src/services/campaigns.ts:111: `console.warn('No matching campaign found for lead');
`
- src/services/campaigns.ts:122: `console.error('Campaign has no steps');
`
- src/services/campaigns.ts:159: `console.error('Failed to enroll lead:', enrollError);
`
- src/services/campaigns.ts:163: `console.log(
`
- src/services/campaigns.ts:260: `console.error('Failed to switch enrollment (maybe mid-send):`
- src/services/campaigns.ts:264: `console.log(
`
- src/services/campaigns.ts:310: `console.log(
`
- src/services/campaigns.ts:354: `console.error('Failed to fetch enrollment for lead:', error)`
- src/services/campaigns.ts:377: `console.error('Failed to fetch enrollment:', enrollError);
`
- src/services/campaigns.ts:383: `console.error(`No claim_token for enrollment ${enrollmentId}`
- src/services/campaigns.ts:397: `console.error('Suppression check failed closed:', err.messag`
- src/services/campaigns.ts:410: `console.log(`Suppressed phone for enrollment ${enrollmentId}`
- src/services/campaigns.ts:427: `console.error('Failed to fetch campaign steps:', stepsError)`
- src/services/campaigns.ts:437: `console.error(`Step ${enrollment.current_step} not found`);
`
- src/services/campaigns.ts:490: `console.warn(`Post-send advance lost claim for ${enrollmentI`
- src/services/campaigns.ts:493: `console.log(
`
- src/services/campaigns.ts:505: `console.error(
`
- src/services/campaigns.ts:525: `console.warn(
`
- src/services/campaigns.ts:534: `console.error(
`
- src/services/campaigns.ts:587: `console.warn(
`
- src/services/campaigns.ts:594: `console.log(
`
- src/services/campaigns.ts:616: `console.warn(
`
- src/services/campaigns.ts:623: `console.log(`Campaign completed for enrollment ${enrollmentI`
- src/services/campaigns.ts:683: `console.error(
`
- src/services/campaigns.ts:709: `console.error('Failed to pause campaign:', error);
`
- src/services/campaigns.ts:713: `console.log(`Campaign paused for lead ${leadId}`);
`
- src/services/campaigns.ts:768: `console.error('Failed to reclaim stale enrollment:', stale.e`
- src/services/campaigns.ts:927: `console.error(
`
- src/services/campaigns.ts:1046: `console.warn(
`
- src/services/campaigns.ts:1086: `console.log('No due campaigns to process');
`
- src/services/campaigns.ts:1118: `console.error(
`
- src/services/campaigns.ts:1143: `console.log(
`
- src/services/sms.ts:108: `console.error('persistDeferredRecovery insert failed:', erro`
- src/services/sms.ts:160: `console.log(
`
- src/services/sms.ts:165: `console.log(
`
- src/services/sms.ts:170: `console.error(`ALERT: recovery SMS needs_review sid=${action`
- src/services/sms.ts:173: `console.warn(
`
- src/services/sms.ts:178: `console.log(
`
- src/services/sms.ts:209: `console.error('processDeferredRecoveries query failed:', err`
- src/services/sms.ts:269: `console.error(
`
- src/services/sms.ts:305: `console.log(
`
- src/services/sms.ts:312: `console.log(
`
- src/services/sms.ts:327: `console.log(
`
- src/services/send/index.ts:234: `console.error(
`


### opt-out-newline-plus-vs-star

- file: `src/services/opt-out.ts` / mutator: Regex / `replace(/[\r\n]+/g, ' ')`
- original → replacement: `+` → empty quantifier
- justification: following `.replace(/\s+/g, ' ')` collapses any run of spaces produced by per-newline replacement, so `+` vs empty quantifier yields the same normalized string.
  Disabled in source.


### opt-out-exact-stop-service-talk-guard

- file: `src/services/opt-out.ts` / mutator: ConditionalExpression,StringLiteral / `normalized === 'STOP'`
- original → replacement: force false / empty needle
- justification: exact `STOP` fails every service-talk alternative (no WONT/STOP BY /
  WONT STOP adjacency), so the early `return false` matches fallthrough.
  Disabled in source.

### opt-out-no-stop-word-boundary-guard

- file: `src/services/opt-out.ts` / mutator: ConditionalExpression / `if (!/\bSTOP\b/)`
- original → replacement: `if (false)`
- justification: without a STOP word, none of the three service-talk alternatives
  can match, so skipping the guard still returns false. Disabled in source.

### opt-out-empty-normalized-early-return

- file: `src/services/opt-out.ts` / mutator: ConditionalExpression / `if (!normalized)`
- original → replacement: `if (!normalized)` → `if (false)`
- justification: empty normalized never matches EXACT/COMPACT/contains/AMBIGUOUS, so
  fallthrough also returns `{ kind: 'not_opt_out' }`. Disabled in source.

### opt-out-compact-stem-regex-redundant

- file: `src/services/opt-out.ts` / mutator: ConditionalExpression / stem vocabulary regex
- original → replacement: `if (/STOP|QUIT|…/.test(compact))` → `if (true)`
- justification: reached only after `compact.includes(kw)` for `kw` drawn from that
  same stem set, so the regex is always true when the guard runs. Disabled in source.

### log-only-console-stringliterals (campaigns-impl / send)

Log-only `console.*` sites in `campaigns-impl.ts` and `send/index.ts` are wrapped in
`// Stryker disable StringLiteral` … `// Stryker restore StringLiteral` blocks.
Replacement only changes operator-visible log text; return values, DB writes, and
control flow are unchanged. (sms.ts now injects `deps.log` with asserted event
names instead.)

### opt-out-spaced-keyword-branch-covered-by-compact

- file: `src/services/opt-out.ts` / mutator: ConditionalExpression,BlockStatement /
  spaced `kw.includes(' ')` branch
- original → replacement: skip spaced-includes short-circuit / empty block
- justification: for the current keyword set (`OPT OUT`), every input that the
  spaced `includes` arm would accept is also accepted by the later `OPTOUT`
  compact stem (`compact.includes('OPTOUT')` + stem regex). Dropping the
  short-circuit still yields `true`. Disabled in source.

### opt-out-spaced-kw-includes-space-guard

- file: `src/services/opt-out.ts` / mutator: ConditionalExpression /
  `if (kw.includes(' '))`
- original → replacement: force false (route spaced kw into word-boundary regex)
- justification: `new RegExp('(?:^|[^A-Z0-9])OPT OUT(?:[^A-Z0-9]|$)')` matches the
  same normalized strings as `normalized.includes('OPT OUT')`, and the `OPTOUT`
  compact path remains as a backstop. Disabled in source.
