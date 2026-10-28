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

### quiet-hours-tz-cache-hit — REMOVED (QC r8)

- Was claimed equivalent for `if (false)` cache-skip only; `if (true)` early
  return is killable. Disable dropped so non-equivalent mutants stay tested.

### quiet-hours-lead-tz-empty-coalesce

- file: `src/services/quiet-hours.ts` / mutator: StringLiteral / line: 60
- original → replacement: `|| ''` → `|| 'Stryker was here!'`
- justification: both the empty string and the filler fail `isValidTimeZone`, so
  resolution falls through identically. Disabled in source.

### quiet-hours-filter-identity (conditional)

- file: `src/services/quiet-hours.ts` / mutator: MethodExpression / line: 72
- original → replacement: `mapped.filter(isValidTimeZone)` → `mapped`
- justification: **conditional** — equivalent only while `AREA_CODE_ZONES`
  lists real IANA ids. A bad zone id in the map would go untested. Disabled
  in source with that caveat.

### quiet-hours-zones-length-one

- file: `src/services/quiet-hours.ts` / mutator: ConditionalExpression / line: 77
- original → replacement: `zones.length === 1` → `true`
- justification: after a successful map lookup, `zones.length === 0` is
  unreachable (filter identity + non-empty map entries), and `length > 1` is
  handled above — so forcing the `=== 1` branch true does not change outcomes.
  Disabled in source.

### QC r8 mutation gate notes

- `quiet-hours-zones.ts` removed from Stryker `mutate` + `check-mutation-scores`
  TARGETS (was 689 static Ignored / 0 tested → vacuous 100%). Covered by
  `quiet-hours-zones.test.ts` (850 dual-zone, 808/907/212, IANA shape).
  mut.py #13 still string-replaces the `'850'` entry.
- `ignoreStatic: false` so `opt-out-data.ts` CONFUSABLES / keyword-list static
  mutants are actually tested.
- Gate fails any non-barrel target with `tested === 0` and
  (`ignored > 0` OR any mutants), and fails if `ignored > MAX_IGNORED_PER_FILE`
  (default 80; override via `MUTATION_MAX_IGNORED`).

### opt-out-compact-set-redundant-with-contains — REMOVED (QC r7)

- Was incorrectly claimed equivalent under the old over-broad substring matcher.
- r7 rewrite uses whole-message / whole-word only; compact short-circuit is
  load-bearing (`S T O P`). Disable dropped; covered by behavioural tests.

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

### opt-out-empty-normalized-early-return — REMOVED (QC r8)

- Pre-r7 claim; `if (true)` always-not-opt-out is killable. Disable dropped.

### opt-out-compact-stem-regex-redundant

- file: `src/services/opt-out.ts` / mutator: ConditionalExpression / stem vocabulary regex
- original → replacement: `if (/STOP|QUIT|…/.test(compact))` → `if (true)`
- justification: reached only after `compact.includes(kw)` for `kw` drawn from that
  same stem set, so the regex is always true when the guard runs. Disabled in source.

### log-only-console-stringliterals (campaigns-impl / send)

Log-only `console.*` sites in `campaigns-impl.ts` and `send/index.ts` are wrapped in
`// Stryker disable StringLiteral,CallExpression` … `// Stryker restore …` blocks.
Replacement only changes operator-visible log text (or no-ops the log call);
return values, DB writes, and control flow are unchanged. (sms.ts injects
`deps.log` with asserted event names instead.)

### log-only-console-expressions (campaign-runtime)

Log-only `console.*` sites in `campaign-runtime.ts` disable
`StringLiteral,CallExpression,BlockStatement,LogicalOperator,OptionalChaining,ConditionalExpression,EqualityOperator,ObjectLiteral,BooleanLiteral`
for the argument expressions that feed log text only (e.g.
`lead?.urgency ?? 'null'` inside a template string, `plan.type === 'advance' ? …`
passed only to `console.log`). Mutating those expressions cannot change return
values, DB writes, or control flow.

### opt-out-spaced-keyword-branch-covered-by-compact (conditional / obsolete)

- Pre-r7 justification depended on over-broad compact substring match.
- After the whole-message rewrite this branch no longer exists in that form.

### opt-out-spaced-kw-includes-space-guard

- file: `src/services/opt-out.ts` / mutator: ConditionalExpression /
  `if (kw.includes(' '))`
- original → replacement: force false (route spaced kw into word-boundary regex)
- justification: `new RegExp('(?:^|[^A-Z0-9])OPT OUT(?:[^A-Z0-9]|$)')` matches the
  same normalized strings as `normalized.includes('OPT OUT')`, and the `OPTOUT`
  compact path remains as a backstop. Disabled in source.

### enroll-plan-empty-steps-early-return — REMOVED (QC r8)

- Not equivalent under ConditionalExpression/BlockStatement mutants (tests kill).
  Disable dropped.

### enroll-plan-switch-options-object-with-treat-false

- file: `src/services/campaign-enroll-plan.ts` / mutator: ObjectLiteral /
  `planEnrollmentStart(steps, { recoveryAlreadySent, treatRecoveryAsInitial: false })`
- original → replacement: `{}`
- justification: with `treatRecoveryAsInitial: false` hardcoded, `recoveryAlreadySent`
  is ignored by `planEnrollmentStart` (always stays on step 1). Empty options are
  therefore equivalent for switch. Disabled in source.

### reply-plan-reason-empty-coalesce

- file: `src/services/campaign-reply-plan.ts` / mutator: StringLiteral /
  `input.reason ?? ''`
- original → replacement: `''` → `'Stryker was here!'`
- justification: when `reason` is undefined, neither `''` nor the filler
  `startsWith('deferred')`; when `reason` is defined, the right-hand coalesce
  is unused. Disabled in source.

### send-suppressed-init-overwritten

- file: `src/services/send/index.ts` / mutator: BooleanLiteral /
  `let suppressed = false`
- original → replacement: `true`
- justification: immediately overwritten by `await deps.isPhoneSuppressed(...)`
  before any read on the success path; failure path returns before the flag is
  read. Disabled in source.

### send-resolveRecovery-default-wrapper — REMOVED (QC r7)

- Disable dropped. Behavioural test calls `resolveRecoveryOutcome` (default
  wrapper) and asserts classified status — see `qc-r7-equivalent-killers.test.ts`.

### campaign-runtime-default-wrappers — REMOVED (QC r7)

- Disables dropped. Public wrapper exports are exercised by DI / integration
  suites that import the non-WithDeps names; emptying is killed.

### campaign-deps-default-factory-sleep — REMOVED (QC r7)

- Disable dropped. Fake-timer test asserts `defaultCampaignDeps().sleep(ms)`
  resolves after the delay — see `qc-r7-equivalent-killers.test.ts`.

### empty-query-result

- file: `src/services/campaign-runtime.ts` / mutator: ObjectLiteral /
  `{ data: null, error: null }` (enroll campaigns short-circuit; send steps
  short-circuit when `campaign == null`)
- original → replacement: `{}`
- justification: callers only read `.data` / `.error`. `undefined` and `null`
  both fail `Boolean(error)` and both coalesce via `?? null` / `stepsForSendPlan`
  identically. Disabled in source.

### absent-vs-empty

- file: `src/services/campaign-runtime.ts` / mutator: StringLiteral /
  recoveryState fallback `'absent'` when lead not found
- original → replacement: `''`
- justification: `planEnroll` / `decideEnrollmentPlan` only special-case
  `recoveryState === 'pending'`; any other string (including `''`) takes the
  same non-pending path as `'absent'`. Disabled in source.

### process-due-empty-short-circuit — REMOVED (QC r8)

- Not equivalent: `if (true)` early-return skips all enrollment processing.
  Disable dropped; log-only disables inside the block kept.


### quiet-hours nextLocalHour / multi-zone search — REMOVED disable-all (QC r7)

- Undocumented `Stryker disable all` blocks on `nextLocalHour` and the
  multi-zone deferral loop were **not** equivalents. Removed.
- Behavioural coverage: DST spring/fall, 850 dual-zone `Math.max` (not min),
  HI/AK area codes — see `quiet-hours.r7.test.ts`.

### quiet-hours-nextlocalhour-ceil-plus-one — REMOVED (QC r8)

- ArithmeticOperator disable also hid `/60_000`→`*60_000` (tests kill).
  Disable dropped.

### inbound-missed-call-log-only

- file: `src/services/inbound.ts`, `src/services/missed-call.ts` / mutator:
  StringLiteral,CallExpression on `console.error` / `console.warn` / `console.log`
- justification: log-only messages; return values, DB writes, and control flow
  unchanged. Wrapped with Stryker disable/restore blocks like campaign-runtime.
  (QC r8: BlockStatement disables wrapping entire try/catch in missed-call were
  REMOVED — they hid try-body mutants; log-only StringLiteral/CallExpression in
  catch kept.)

### inbound-updateError-log-only-guard

- file: `src/services/inbound.ts` / mutator: ConditionalExpression /
  `if (updateError)`
- original → replacement: `if (false)`
- justification: the branch only logs; enrollment/escalation/return continue
  identically. Disabled in source.

### campaign-logic-urgency-null-guard — REMOVED (QC r8)

- Not equivalent under tests (`if (true)` / forced null paths diverge). Disable dropped.

### campaign-logic-reply-mode-empty-default

- file: `src/services/campaign-logic.ts` / mutator: StringLiteral /
  `env.CAMPAIGN_REPLY_MODE || 'pause'`
- original → replacement: `|| ''`
- justification: both `''` and `'pause'` fail `=== 'continue'` and return
  `'pause'`. Disabled in source.

### campaign-logic-fresh-claim-naN-guards — REMOVED (QC r8)

- NaN/falsy ConditionalExpression disables killed by tests. Disable dropped.

### campaign-logic-lookup-age-string-date-naN — REMOVED (QC r8)

- NaN/typeof ConditionalExpression disables killed by tests. Disable dropped.

### opt-out-empty-normalized-early-return (r7 rewrite) — REMOVED (QC r8)

- `if (!normalized)` → `if (true)` always-not-opt-out is killable. Disable dropped.

### opt-out-newline-plus-vs-star (r7 rewrite)

- file: `src/services/opt-out.ts` / mutator: Regex / `replace(/[\r\n]+/g, ' ')`
- justification: following `.replace(/\s+/g, ' ')` collapses any run of spaces,
  so `+` vs empty quantifier yields the same normalized string. Disabled.

### missed-call-suppressed-init-overwritten

- file: `src/services/missed-call.ts` / mutator: BooleanLiteral /
  `let suppressed = false`
- justification: overwritten by `isPhoneSuppressed` before read; fail-closed
  path sets `true` before read. Disabled.
