from pathlib import Path
import subprocess, sys, json, os
R=str(Path(__file__).resolve().parents[1])+'/'
I='src/services/send/index.ts'
D='src/services/send/decisions.ts'
CI='src/services/campaign-runtime.ts'
CD='src/services/campaign-decisions.ts'
CSP='src/services/campaign-send-plan.ts'
SIO='src/services/send/send-io-plans.ts'
RT='src/services/send/reconcile-tally.ts'
S='src/services/sms.ts'
M='src/services/send/machine.ts'
Q='src/services/quiet-hours.ts'
Z='src/services/quiet-hours-zones-data.ts'
G='supabase/migrations/003_campaign_idempotency.sql'
# Injected advance into campaign outcome interpreters (must break tests).
ADV="return { type: 'advance' }; // mut"
muts=[
# id, tag, file, old, new, occurrence(1-based)
('01','r4#2 recovery gate pending',D,"    if (input.recovery === 'pending') {\n      return { kind: 'blocked', reason: 'recovery_pending' };\n    }","    if (false) {\n      return { kind: 'blocked', reason: 'recovery_pending' };\n    }",1),
('02','r4#2 recovery resolved_sent skip',D,"    if (input.recovery === 'resolved_sent') {\n      return {\n        kind: 'skipped',\n        reason: 'recovery_already_sent_skip_step_1',\n      };\n    }","    if (false) {\n      return {\n        kind: 'skipped',\n        reason: 'recovery_already_sent_skip_step_1',\n      };\n    }",1),
('03','r4#2 enroll park when recovery pending',CD,"  if (input.recoveryState === 'pending' && !input.recoveryConfirmed) {\n    nextSendAt =\n      input.parkedIso ?? parkedNextSendAt(input.now ?? new Date());\n  }","  if (false) {\n    nextSendAt =\n      input.parkedIso ?? parkedNextSendAt(input.now ?? new Date());\n  }",1),
('04','r4#2 recovery resend removed',CI,"await resendRecoveryIdempotent(\n        deps,\n        supabase,\n        action.leadId,\n        original\n      );","void 0;",1),
('05','r4#2 skipRecoveryGate forced',CSP,"    skipRecoveryGate: decideSkipRecoveryGate({","    skipRecoveryGate: true || decideSkipRecoveryGate({",1),
('06','r4#2 never_sent clears recovery marker',SIO,"export function clearLeadOutboundSidPayload(): Record<string, unknown> {\n  return { sms_outbound_sid: null };\n}","export function clearLeadOutboundSidPayload(): Record<string, unknown> {\n  return {};\n}",1),
('07','r4#3 reconcile ORDER BY desc',I,".order(COL.sentAt, { ascending: true })",".order(COL.sentAt, { ascending: false })",1),
('08','r4#3 attempts never increment',SIO,"    reconcile_attempts: input.nextAttempts,","    reconcile_attempts: 0,",1),
('09','r4#3 alert on needs_review',RT,"    counts.needsReview > 0","    false",1),
('10','r4#4 cron per-row catch rethrows',CI,"      // Isolate per-enrollment failures (e.g. invalid timezone) so one bad","      throw err; //",1),
('11','r4#4 quiet unresolved treated as allowed',D,"  if (!input.skipQuietHours && input.quiet && !input.quiet.allowed) {","  if (!input.skipQuietHours && input.quiet && !input.quiet.allowed && !('unresolved' in input.quiet)) {",1),
('12','r4#4 unresolved -> campaign release w/o review',D,"    if (outcome.reason === 'quiet_hours_unresolved') {\n      return { type: 'flag_unresolved_tz', nextSendAt: parkedFallbackIso };\n    }","    if (false) {\n      return { type: 'flag_unresolved_tz', nextSendAt: parkedFallbackIso };\n    }",1),
('13','r4#5 850 Central only',Z,'  "850": [\n    "America/Chicago",\n    "America/New_York"\n  ],','  "850": [\n    "America/Chicago"\n  ],',1),
('14','r4#5 unmapped -> business TZ',Q,"return { zones: [], ambiguous: false, known: false, endHour };","return { zones: opts.businessTimezone ? [opts.businessTimezone] : [], ambiguous: false, known: false, endHour };",1),
('15','r4#5 OK dropped from 8pm rule',Q,"if (ac && (FL_AREA.has(ac) || OK_AREA.has(ac))) return QUIET_END_HOUR_FL_OK;","if (ac && FL_AREA.has(ac)) return QUIET_END_HOUR_FL_OK;",1),
('16','r4#5 leadTimezone not passed (campaign)',CI,"    leadTimezone: pre.leadTimezone,","    leadTimezone: null,",1),
('17','r4#5 leadTimezone ignored (module)',I,"        leadTimezone: leadTz,","        leadTimezone: null,",1),
('18','r4#6 confusable fold removed','src/services/opt-out.ts',"out += CONFUSABLES[ch] ?? ch;","out += ch;",1),
('19','r4#6 compact form removed','src/services/opt-out.ts',"  if (\n    WHOLE_MESSAGE_SET.has(normalized) ||\n    WHOLE_COMPACT_SET.has(compact) ||\n    WHOLE_MESSAGE_SET.has(collapsed) ||\n    WHOLE_COMPACT_SET.has(collapsedCompact)\n  ) {\n    return { kind: 'opt_out' };\n  }","  if (\n    WHOLE_MESSAGE_SET.has(normalized) ||\n    WHOLE_MESSAGE_SET.has(collapsed)\n  ) {\n    return { kind: 'opt_out' };\n  }",1),
('20','r4#6 opted_out gate in module',D,"  if (input.optedOut) {\n    return { kind: 'blocked', reason: 'opted_out' };\n  }","  if (false) {\n    return { kind: 'blocked', reason: 'opted_out' };\n  }",1),
('21','r4#6 suppression gate in module',D,"  if (input.suppressed) {\n    return { kind: 'blocked', reason: 'suppressed' };\n  }","  if (false) {\n    return { kind: 'blocked', reason: 'suppressed' };\n  }",1),
# occurrence 2 = STOP backfill INSERT (load-bearing); rebuild staging is #1
('22','r4#7 backfill ON CONFLICT dropped',G,"ON CONFLICT (business_id, phone) DO NOTHING;",";",2),
('23','r4#7 enrollment dedupe prefers non-active',G,"CASE WHEN status = 'active' THEN 0 ELSE 1 END,","CASE WHEN status = 'active' THEN 1 ELSE 0 END,",1),
('24','r4#7 NULLS LAST -> FIRST',G,"enrolled_at DESC NULLS LAST,","enrolled_at DESC NULLS FIRST,",1),
# QC r9: outer+inner NFKC sandwich — removing only the inner NFKC is equivalent
# because the outer normalize(..., NFKC) still folds math-bold / compatibility.
('25','r4#7 NFKC removed from backfill',G,"normalize(opt_out_finish_normalized(normalize(btrim(m.body), NFKC)), NFKC)","opt_out_finish_normalized(btrim(m.body))",1),
# Removes compact STOPPLEASE (exact STOP PLEASE alone still leaves compact arm).
('26','r4#7 STOPPLEASE compact removed from backfill',G,"'PLEASESTOP', 'STOPPLEASE', 'STOPIT', 'STOPPLS',","'PLEASESTOP', 'STOPIT', 'STOPPLS',",1),
('27','r4b A caps probe removed',I,"    capsBeforeSend = await deps.ensureCaps(adapter);","    capsBeforeSend = true;",1),
('28','r4b A echo-only gate',M,"keySupportedAtSend: capsBeforeSend && signal.keyEchoed,","keySupportedAtSend: signal.keyEchoed,",1),
('29','r4b A caps-only gate',M,"keySupportedAtSend: capsBeforeSend && signal.keyEchoed,","keySupportedAtSend: capsBeforeSend,",1),
('30','r4b A keyEchoed always true',D,"    keyEchoed: Boolean(result.keyEchoed),","    keyEchoed: true,",1),
('31','r4b A key_supported persisted true',SIO,"    key_supported_at_send: input.keySupportedAtSend,","    key_supported_at_send: true,",1),
('32','r4b A reconcile trusts key support',I,"    keySupportedAtSend: Boolean(row.key_supported_at_send),","    keySupportedAtSend: true,",1),
('33','r4b B 409 ignored',D,"  if (result.conflict) return { type: 'conflict' };","  if (false) return { type: 'conflict' };",1),
('34','r4b B needs_review -> advance (campaign)',D,"  if (outcome.kind === 'needs_review') {\n    return { type: 'needs_review_terminal', reason: outcome.reason };\n  }","  if (outcome.kind === 'needs_review') { "+ADV+"\n  }",1),
('35','r4b B needs_review not persisted',SIO,"    status: input.status,\n    next_retry_at: null,","    status: 'queued',\n    next_retry_at: null,",1),
('36','r4b C failed status ignored',D,"  if (isFailedStatus(result.status)) {\n    return { type: 'failed', status: result.status };\n  }","  if (false) {\n    return { type: 'failed', status: result.status };\n  }",1),
('37','r4b C dup-sid failed -> needs_review',D,"  if (\n    isFailedStatus(existingStatus) ||\n    String(existingStatus ?? '').toLowerCase() === 'needs_review'\n  ) {\n    return { action: 'needs_review', reason: 'duplicate_failed' };\n  }","  if (false) {\n    return { action: 'needs_review', reason: 'duplicate_failed' };\n  }",1),
('38','r4b C dup-sid confirmed short-circuit',D,"  if (isConfirmedStatus(existingStatus)) {\n    return { action: 'confirm_existing', status: existingStatus! };\n  }","  if (false) {\n    return { action: 'confirm_existing', status: existingStatus! };\n  }",1),
('39','r4b D 429 ambiguous ignored',D,"  if (result.ambiguous) {\n    return result.status === 'maintenance'\n      ? { type: 'maintenance' }\n      : { type: 'rate_limit' };\n  }","  if (false) {\n    return result.status === 'maintenance'\n      ? { type: 'maintenance' }\n      : { type: 'rate_limit' };\n  }",1),
('40','r4b D ambiguous -> advance (campaign)',D,"  if (outcome.kind === 'ambiguous') {\n    return {\n      type: 'park',\n      nextSendAt: outcome.nextRetryAt ?? parkedFallbackIso,\n    };\n  }","  if (outcome.kind === 'ambiguous') { "+ADV+"\n  }",1),
('41','r4b D park status unknown not set',SIO,"export function smsParkAmbiguousPayload(input: {\n  status: string;\n  nextAttempts: number;\n  nextRetryAt: string;\n}): Record<string, unknown> {\n  return {\n    status: input.status,","export function smsParkAmbiguousPayload(input: {\n  status: string;\n  nextAttempts: number;\n  nextRetryAt: string;\n}): Record<string, unknown> {\n  return {\n    status: 'queued',",1),
('42','E.164 normalization removed',I,"  const toE164 = tryNormalizeToE164(req.to);","  const toE164 = req.to || null;",1),
('43','E.164 raw to relay',I,"      to: toE164,","      to: req.to,",1),
('44','claim check on advance removed',CI,"    .eq(COL.claimToken, claimToken)\n    .select(ENROLLMENT_CLAIM_SELECT);","    .select(ENROLLMENT_CLAIM_SELECT);",1),
('45','recovery_pending -> advance',D,"    if (outcome.reason === 'recovery_pending') {\n      return { type: 'park' };\n    }","    if (outcome.reason === 'recovery_pending') { "+ADV+"\n    }",1),
('46','requeue exact step removed',CI,"const ok = await requeueExactCampaignStep(","const ok = false && await requeueExactCampaignStep(",1),
# new claims
('47','(b) urgency gate removed',CI,"if (lead.urgency == null || String(lead.urgency).trim() === '') {","if (false) {",1),  # intentional NOMATCH — urgency gate removed for Standard enroll
('48','(c) ENROLLMENT_CLAIM_SELECT -> id','src/lib/postgrest-select.ts',"export const ENROLLMENT_CLAIM_SELECT = 'id, claim_token, claimed_at';","export const ENROLLMENT_CLAIM_SELECT = 'id';",1),
('49','(c) switch uses select(id)',CI,"    .or(`claim_token.is.null,claimed_at.lt.${staleBefore}`)\n    .select(ENROLLMENT_CLAIM_SELECT)","    .or(`claim_token.is.null,claimed_at.lt.${staleBefore}`)\n    .select('id')",1),
('50','SSL rejectUnauthorized forced false','scripts/staging-ssl.mjs',"  return sslDisabled ? false : { rejectUnauthorized };","  return { rejectUnauthorized: false };",1),
('51','dry-run redaction removed','src/lib/messaging/dry-run.ts',"const bodyPreview = redactPhonesInText(input.body).slice(0, 120);","const bodyPreview = input.body.slice(0, 120);",1),
('52','dry-run to redaction removed','src/lib/messaging/dry-run.ts',"queue SMS to ${redactPhone(input.to)}","queue SMS to ${input.to}",1),
('53','ONE_GATEWAY_URL unset non-prod uses default','src/lib/gemini.ts',"    throw new Error(\n      'ONE_GATEWAY_URL is unset — refusing","    return PRODUCTION_DEFAULT_GATEWAY_URL; throw new Error(\n      'ONE_GATEWAY_URL is unset — refusing",1),
('54','ONE_GATEWAY_URL unset prod uses default','src/lib/gemini.ts',"    if (isProduction) {","    if (isProduction) { return PRODUCTION_DEFAULT_GATEWAY_URL;",1),
('55','recovery quiet hours skipped',S,"skipQuietHours: false,","skipQuietHours: true,",1),
('56','quiet hours gate removed in module',I,"    if (!req.skipQuietHours) {","    if (false) {",1),
('57','recovery non-stable key',S,"idempotencyKey: recoveryMessageSid(lead.id),","idempotencyKey: `mlf:recovery:${lead.id}:${Date.now()}`,",1),
('58','SENDS_ENABLED gate removed (send)',I,"  if (!deps.sendsEnabled()) {\n    return { kind: 'blocked', reason: 'sends_disabled' };\n  }\n\n  const toE164","  if (false) {\n    return { kind: 'blocked', reason: 'sends_disabled' };\n  }\n\n  const toE164",1),
('59','SENDS_ENABLED gate removed (reconcile)',I,"  if (!deps.sendsEnabled()) {\n    return { kind: 'blocked', reason: 'sends_disabled' };\n  }\n\n  const adapter","  if (false) {\n    return { kind: 'blocked', reason: 'sends_disabled' };\n  }\n\n  const adapter",1),
('60','missed-call enrolls again','src/services/missed-call.ts',"  return { missedCallId: missedCall.id, leadId: lead.id };","  await (await import('@/services/campaigns')).enrollLeadInCampaign(lead.id).catch(() => null);\n  return { missedCallId: missedCall.id, leadId: lead.id };",1),
('61','maintenance mapped to rate_limit',D,"    return result.status === 'maintenance'\n      ? { type: 'maintenance' }\n      : { type: 'rate_limit' };","    return false\n      ? { type: 'maintenance' }\n      : { type: 'rate_limit' };",1),
('62','campaign suppressed/opted_out -> release not pause',D,"    if (outcome.reason === 'suppressed' || outcome.reason === 'opted_out') {\n      return { type: 'pause_opt_out' };\n    }","    if (false) {\n      return { type: 'pause_opt_out' };\n    }",1),
('63','campaign quiet deferred -> release w/o nextSendAt',D,"    if (outcome.reason === 'quiet_hours_deferred' && outcome.nextSendAt) {\n      return { type: 'release', nextSendAt: outcome.nextSendAt, ok: true };\n    }","    if (false) {\n      return { type: 'release', nextSendAt: outcome.nextSendAt, ok: true };\n    }",1),
('64','advanceAfterConfirmed steals live claim',CD,"  if (input.hasClaimToken) return false;","",1),
]
only=set(sys.argv[1:])
res=[]
for mid,tag,f,old,new,occ in muts:
  if only and mid not in only: continue
  p=R+f; src=open(p).read(); n=src.count(old)
  if n<occ: res.append((mid,tag,'NOMATCH')); print(mid,tag,'NOMATCH',flush=True); continue
  i=-1
  for _ in range(occ): i=src.index(old,i+1)
  open(p,'w').write(src[:i]+new+src[i+len(old):])
  try:
    r=subprocess.run('npx vitest run --reporter=dot',shell=True,cwd=R,capture_output=True,text=True,timeout=300)
    killed = r.returncode!=0
  finally:
    open(p,'w').write(src)
  res.append((mid,tag,'KILLED' if killed else 'SURVIVED')); print(mid,tag,'KILLED' if killed else 'SURVIVED',flush=True)
out = str(Path(__file__).resolve().parents[1] / 'reports/mutation/mut-results.json')
Path(out).parent.mkdir(parents=True, exist_ok=True)
json.dump(res, open(out, 'w'), indent=1)
print('wrote', out)
