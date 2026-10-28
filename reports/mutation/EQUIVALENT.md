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
