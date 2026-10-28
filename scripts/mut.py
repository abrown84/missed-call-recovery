from pathlib import Path
import subprocess, sys, json, os
R=str(Path(__file__).resolve().parents[1])+'/'
I='src/services/send/index.ts'; C='src/services/campaigns.ts'; S='src/services/sms.ts'; M='src/services/send/machine.ts'
Q='src/services/quiet-hours.ts'; Z='src/services/quiet-hours-zones.ts'; G='supabase/migrations/003_campaign_idempotency.sql'
ADV="await advanceEnrollment(supabase, enrollmentId, token, enrollment.current_step, steps); return true;"
muts=[
# id, r5-row/tag, file, old, new, occurrence(1-based)
('01','r4#2 recovery gate pending',I,"if (recovery === 'pending') {","if (false) {",1),
('02','r4#2 recovery resolved_sent skip',I,"if (recovery === 'resolved_sent') {","if (false) {",1),
('03','r4#2 enroll park when recovery pending',C,"if (recoveryState === 'pending' && !recoveryConfirmed) {","if (false) {",1),
('04','r4#2 recovery resend removed',C,"await resendRecoveryIdempotent(supabase, parsed.leadId, original);","void 0;",1),
('05','r4#2 skipRecoveryGate forced',C,"skipRecoveryGate: !(","skipRecoveryGate: true || !(",1),
('06','r4#2 never_sent clears recovery marker',I,".update({ sms_outbound_sid: null })",".update({})",1),
('07','r4#3 reconcile ORDER BY desc',I,".order('sent_at', { ascending: true })",".order('sent_at', { ascending: false })",1),
('08','r4#3 attempts never increment',I,"reconcile_attempts: nextAttempts,","reconcile_attempts: attempts,",1),
('09','r4#3 alert on needs_review',I,"    needsReview > 0;","    false;",1),
('10','r4#4 cron per-row catch rethrows',C,"      // Isolate per-enrollment failures (e.g. invalid timezone) so one bad","      throw err; //",1),
('11','r4#4 quiet unresolved treated as allowed',I,"if (!quiet.allowed) {","if (!quiet.allowed && !('unresolved' in quiet)) {",1),
('12','r4#4 unresolved -> campaign release w/o review',C,"if (outcome.reason === 'quiet_hours_unresolved') {","if (false) {",1),
('13','r4#5 850 Central only',Z,"'850': ['America/New_York', 'America/Chicago'],","'850': ['America/Chicago'],",1),
('14','r4#5 unmapped -> business TZ',Q,"return { zones: [], ambiguous: false, known: false, endHour };","return { zones: opts.businessTimezone ? [opts.businessTimezone] : [], ambiguous: false, known: false, endHour };",1),
('15','r4#5 OK dropped from 8pm rule',Q,"if (ac && (FL_AREA.has(ac) || OK_AREA.has(ac))) return QUIET_END_HOUR_FL_OK;","if (ac && FL_AREA.has(ac)) return QUIET_END_HOUR_FL_OK;",1),
('16','r4#5 leadTimezone not passed (campaign)',C,"leadTimezone: leadTz,","leadTimezone: null,",1),
('17','r4#5 leadTimezone ignored (module)',I,"leadTimezone: leadTz,","leadTimezone: null,",1),
('18','r4#6 confusable fold removed','src/services/opt-out.ts',"out += CONFUSABLES[ch] ?? ch;","out += ch;",1),
('19','r4#6 compact form removed','src/services/opt-out.ts',"if (OPT_OUT_COMPACT.has(compact)) return { kind: 'opt_out' };","",1),
('20','r4#6 opted_out gate in module',I,"if (lead?.opted_out) {","if (false) {",1),
('21','r4#6 suppression gate in module',I,"if (await isPhoneSuppressed(req.businessId, toE164)) {","if (false) {",1),
('22','r4#7 backfill ON CONFLICT dropped',G,"ON CONFLICT (business_id, phone) DO NOTHING;",";",1),
('23','r4#7 enrollment dedupe prefers non-active',G,"CASE WHEN status = 'active' THEN 0 ELSE 1 END,","CASE WHEN status = 'active' THEN 1 ELSE 0 END,",1),
('24','r4#7 NULLS LAST -> FIRST',G,"enrolled_at DESC NULLS LAST,","enrolled_at DESC NULLS FIRST,",1),
('25','r4#7 NFKC removed from backfill',G,"normalize(btrim(m.body), NFKC),","btrim(m.body),",1),
('26','r4#7 STOP PLEASE removed from backfill',G,"'PLEASE STOP', 'STOP PLEASE', 'STOP IT', 'STOP PLS',","'PLEASE STOP', 'STOP IT', 'STOP PLS',",1),
('27','r4b A caps probe removed',I,"capsBeforeSend = await ensureRelayKeySupportProbed(adapter);","capsBeforeSend = true;",1),
('28','r4b A echo-only gate',M,"keySupportedAtSend: capsBeforeSend && signal.keyEchoed,","keySupportedAtSend: signal.keyEchoed,",1),
('29','r4b A caps-only gate',M,"keySupportedAtSend: capsBeforeSend && signal.keyEchoed,","keySupportedAtSend: capsBeforeSend,",1),
('30','r4b A keyEchoed always true',I,"keyEchoed: Boolean(result.keyEchoed),","keyEchoed: true,",1),
('31','r4b A key_supported persisted true',I,"key_supported_at_send: decision.keySupportedAtSend,","key_supported_at_send: true,",1),
('32','r4b A reconcile trusts key support',I,"keySupportedAtSend: Boolean(row.key_supported_at_send),","keySupportedAtSend: true,",1),
('33','r4b B 409 ignored',I,"if (result.conflict) {","if (false) {",1),
('34','r4b B needs_review -> advance (campaign)',C,"if (outcome.kind === 'needs_review') {","if (outcome.kind === 'needs_review') { "+ADV,1),
('35','r4b B needs_review not persisted',I,".update({ status: 'needs_review' })",".update({ status: 'queued' })",1),
('36','r4b C failed status ignored',I,"} else if (isFailedStatus(result.status)) {","} else if (false) {",1),
('37','r4b C dup-sid failed -> needs_review',I,"if (isFailedStatus(existing?.status) || existing?.status === 'needs_review') {","if (false) {",1),
('38','r4b C dup-sid confirmed short-circuit',I,"if (isConfirmedStatus(existing?.status)) {","if (false) {",1),
('39','r4b D 429 ambiguous ignored',I,"} else if (result.ambiguous) {","} else if (false) {",1),
('40','r4b D ambiguous -> advance (campaign)',C,"if (outcome.kind === 'ambiguous') {","if (outcome.kind === 'ambiguous') { "+ADV,1),
('41','r4b D park status unknown not set',I,"status: 'unknown',","status: 'queued',",1),
('42','E.164 normalization removed',I,"const toE164 = tryNormalizeToE164(req.to);","const toE164 = req.to || null;",1),
('43','E.164 raw to relay',I,"      to: toE164,","      to: req.to,",1),
('44','claim check on advance removed',C,"      .eq('claim_token', claimToken)\n      .select(ENROLLMENT_CLAIM_SELECT);","      .select(ENROLLMENT_CLAIM_SELECT);",1),
('45','recovery_pending -> advance',C,"if (outcome.reason === 'recovery_pending') {","if (outcome.reason === 'recovery_pending') { "+ADV,1),
('46','requeue exact step removed',C,"const ok = await requeueExactCampaignStep(","const ok = false && await requeueExactCampaignStep(",1),
# new claims
('47','(b) urgency gate removed',C,"if (lead.urgency == null || String(lead.urgency).trim() === '') {","if (false) {",1),
('48','(c) ENROLLMENT_CLAIM_SELECT -> id','src/lib/postgrest-select.ts',"export const ENROLLMENT_CLAIM_SELECT = 'id, claim_token, claimed_at';","export const ENROLLMENT_CLAIM_SELECT = 'id';",1),
('49','(c) switch uses select(id)',C,"    .or(`claim_token.is.null,claimed_at.lt.${staleBefore}`)\n    .select(ENROLLMENT_CLAIM_SELECT)","    .or(`claim_token.is.null,claimed_at.lt.${staleBefore}`)\n    .select('id')",1),
('50','SSL rejectUnauthorized forced false','scripts/staging-campaign-evidence.mjs',"const ssl = sslDisabled ? false : { rejectUnauthorized };","const ssl = { rejectUnauthorized: false };",1),
('51','dry-run redaction removed','src/lib/messaging/dry-run.ts',"const bodyPreview = redactPhonesInText(input.body).slice(0, 120);","const bodyPreview = input.body.slice(0, 120);",1),
('52','dry-run to redaction removed','src/lib/messaging/dry-run.ts',"queue SMS to ${redactPhone(input.to)}","queue SMS to ${input.to}",1),
('53','ONE_GATEWAY_URL unset non-prod uses default','src/lib/gemini.ts',"    throw new Error(\n      'ONE_GATEWAY_URL is unset — refusing","    return PRODUCTION_DEFAULT_GATEWAY_URL; throw new Error(\n      'ONE_GATEWAY_URL is unset — refusing",1),
('54','ONE_GATEWAY_URL unset prod uses default','src/lib/gemini.ts',"    if (isProduction) {","    if (isProduction) { return PRODUCTION_DEFAULT_GATEWAY_URL;",1),
('55','recovery quiet hours skipped',S,"skipQuietHours: false,","skipQuietHours: true,",1),
('56','quiet hours gate removed in module',I,"if (!req.skipQuietHours) {","if (false) {",1),
('57','recovery non-stable key',S,"idempotencyKey: recoveryMessageSid(leadId),","idempotencyKey: `mlf:recovery:${leadId}:${Date.now()}`,",1),
('58','SENDS_ENABLED gate removed (send)',I,"  if (!isSendsEnabled()) {\n    return { kind: 'blocked', reason: 'sends_disabled' };\n  }\n\n  const toE164","  if (false) {\n    return { kind: 'blocked', reason: 'sends_disabled' };\n  }\n\n  const toE164",1),
('59','SENDS_ENABLED gate removed (reconcile)',I,"  if (!isSendsEnabled()) {\n    return { kind: 'blocked', reason: 'sends_disabled' };\n  }\n\n  const adapter","  if (false) {\n    return { kind: 'blocked', reason: 'sends_disabled' };\n  }\n\n  const adapter",1),
('60','missed-call enrolls again','src/services/missed-call.ts',"  return { missedCallId: missedCall.id, leadId: lead.id };","  await (await import('@/services/campaigns')).enrollLeadInCampaign(lead.id).catch(() => null);\n  return { missedCallId: missedCall.id, leadId: lead.id };",1),
('61','maintenance mapped to rate_limit',I,"result.status === 'maintenance'","false",1),
('62','campaign suppressed/opted_out -> release not pause',C,"if (outcome.reason === 'suppressed' || outcome.reason === 'opted_out') {","if (false) {",1),
('63','campaign quiet deferred -> release w/o nextSendAt',C,"if (outcome.reason === 'quiet_hours_deferred' && outcome.nextSendAt) {","if (false) {",1),
('64','advanceAfterConfirmed steals live claim',C,"  if (enrollment.claim_token) return;","",1),
]
only=set(sys.argv[1:])
res=[]
for mid,tag,f,old,new,occ in muts:
  if only and mid not in only: continue
  p=R+f; src=open(p).read(); n=src.count(old)
  if n<occ: res.append((mid,tag,'NOMATCH')); print(mid,'NOMATCH',flush=True); continue
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
