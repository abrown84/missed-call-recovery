# Multi-Touch SMS Campaign System

## Overview

Automated multi-touch SMS follow-up campaigns that dramatically increase response rates from 20% (single touch) to 60%+ (multi-touch sequences).

## Features

✅ **Auto-Enrollment** - Leads automatically enrolled in campaigns based on urgency
✅ **Urgency-Based Sequences** - Different cadences for emergency, high, and normal priority leads
✅ **Smart Templates** - Context-aware SMS templates for each step
✅ **Auto-Pause** - Campaigns pause when customer responds
✅ **Scheduled Delivery** - Follow-ups processed every 5 minutes (GitHub Actions cron; see below)
✅ **Rate Limiting** - Built-in delays to respect SMS best practices
✅ **Idempotent sends** - Recovery SMS + campaign step 1 never double-fire; cron claims enrollments

---

## Campaign Sequences

### **Emergency Campaign** (3 touches, fast cadence)
- **Step 1**: Immediate - Initial recovery SMS with urgent tone
- **Step 2**: +1 hour - First follow-up if no response
- **Step 3**: +4 hours - Final check-in

**Use case**: Flooding, gas leaks, no power, active danger

---

### **High Priority Campaign** (4 touches)
- **Step 1**: Immediate - Recovery SMS, helpful tone
- **Step 2**: +2 hours - Checking in
- **Step 3**: +24 hours - Offering availability
- **Step 4**: +3 days - Last check

**Use case**: No heat, no AC, water heater out, urgent repairs

---

### **Standard Campaign** (5 touches, persistent)
- **Step 1**: Immediate - Friendly recovery SMS
- **Step 2**: +4 hours - First follow-up
- **Step 3**: +24 hours - Second follow-up
- **Step 4**: +3 days - Third follow-up
- **Step 5**: +7 days - Final message

**Use case**: Quote requests, routine repairs, normal service

---

## Database Schema

### **campaigns**
Defines multi-touch sequences

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Campaign name |
| vertical | vertical_type | Service vertical (plumbing, HVAC, etc.) |
| urgency_filter | urgency_level | Target urgency (null = all) |
| status | campaign_status | active, paused, archived |
| auto_enroll | BOOLEAN | Auto-enroll new leads? |

### **campaign_steps**
Individual touches in sequence

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| campaign_id | UUID | Parent campaign |
| step_number | INTEGER | Position in sequence (1, 2, 3...) |
| delay_minutes | INTEGER | Delay from previous step |
| template_key | TEXT | SMS template identifier |

### **campaign_enrollments**
Tracks leads in campaigns

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| lead_id | UUID | Associated lead |
| campaign_id | UUID | Campaign they're enrolled in |
| current_step | INTEGER | Current position in sequence |
| status | enrollment_status | active, paused, completed, opted_out |
| next_send_at | TIMESTAMPTZ | When to send next SMS |
| enrolled_at | TIMESTAMPTZ | Enrollment timestamp |
| paused_at | TIMESTAMPTZ | When paused (if applicable) |
| completed_at | TIMESTAMPTZ | When completed (if applicable) |

---

## Environment knobs

| Variable | Default | Meaning |
|----------|---------|---------|
| `SENDS_ENABLED` | `true` | App-side kill switch. `false`/`0`/`off` blocks **every** outbound path (recovery, campaign, escalation, manual). Prefer this for freezes over dry-run. |
| `CAMPAIGN_REPLY_MODE` | `pause` | After a classified reply on the **matching** campaign: `pause` stops follow-ups; `continue` keeps the sequence running. |
| `UNKNOWN_SMS_ALERT_THRESHOLD` | `5` | Cron alerts when ambiguous (`unknown` + stuck `sending`) rows in a reconcile pass meet/exceed this count. |
| `MESSAGING_PROVIDER` | `brwn-relay` | `dry-run` is **test-only** (forbidden in production runtime). Fakes capabilities + key echo; idempotency store is **in-memory only**. |
| `ONE_GATEWAY_URL` | *(required outside prod)* | Unset outside production → fail closed (no external call). Production should set explicitly. |

### BRWN Text relay version

**Requeue / reconcile requires relay >= v1.7.6.** That release adds:

- `GET /api/capabilities` (sender Bearer) → `{ relay, version, idempotency: true }` — authoritative probe before trusting keys.
- `POST /api/messages` JSON: `to`, `body`, `auto`, optional `idempotencyKey` (body field, not a header). Keys are always prefixed `mlf:…`. Success echoes `idempotencyKey`. Duplicate key → `200 { id, status, duplicate: true, idempotencyKey }`. Key reused with different recipient/body → **`409 { error: 'idempotency_conflict', idempotencyKey }`** → **needs_review** (never success).
- `GET /api/messages?idempotencyKey=<key>` → `{ found: false }` or `{ found: true, id, toLast4, status, error, created, updated, attempts, auto }` (`toLast4`, not `to`).
- Rate limit: **`429 { error: 'recent_send' }`**. Keyed 429 → **unknown (park)**, not a hard error.
- Freeze: **`503 { error: 'maintenance' }`** → park (ambiguous), **never** counted as failure.
- Older relays lack `/api/capabilities` or return 405 on GET lookup → cron logs a loud alert; parked rows stay visible.

**`key_supported_at_send` is set only when both are true for that row:**
1. `GET /api/capabilities` returned `idempotency: true` *before* the send, and
2. the send response echoed `idempotencyKey`.

Trust `found:false` / `never_sent` **only** for those rows. Everything else → `needs_review` (never auto-requeue).

### Parked retry cadence

Ambiguous (`unknown` / stuck `sending`) rows retry with exponential backoff:

- delay = `min(5min × 2^attempts, 6h)`
- after **5** reconcile attempts → `needs_review` (stop auto-retry)

Justification: 5 minutes absorbs brief relay blips; doubling avoids stampeding a recovering node; 6h cap keeps overnight parks from waiting a full day; 5 attempts ≈ ~2.5h of active retry before human review.

### Relay upgrade / rollback freeze (required)

A send that timed out on **&lt; 1.7.6** (no key / no capabilities) can look like `{ found: false }` after an upgrade — auto-requeue would double-text. Same risk on rollback.

**Before any relay upgrade or rollback:**

1. **Send freeze** — set `SENDS_ENABLED=false` (preferred) and/or pause the GHA campaign cron. Do **not** rely on dry-run for production freezes (it fakes caps/echo).
2. **Drain parked rows** — keep running cron / reconcile until no actionable `unknown` / stuck `sending` backlog (or move leftovers to `needs_review` by hand).
3. Deploy / roll the relay to the target version (**>= 1.7.6** for upgrades). Relay `503 maintenance` during cutover parks sends safely.
4. Confirm `GET /api/capabilities` returns `{ …, idempotency: true }` on the target version.
5. Resume with `SENDS_ENABLED=true`. New rows that also get a key echo receive `key_supported_at_send=true`.

**Rollback of the relay** (e.g. 1.7.6 → older): freeze + drain first. After rollback, capabilities will not report `idempotency:true`; any subsequent `found:false` on pre-rollback keys goes to `needs_review` (safe).

**Code rollback after migration 003 rollback:** freeze sends, restore `sms_suppressions` from `sms_suppressions_archive_003` if needed, then unfreeze. Migration 003 **never** merge-deletes businesses — phone collisions abort via `003_phone_collision_abort.sql`.

### Behavior changes (QC r6) — disclose / Alex flags

| Change | Detail |
|--------|--------|
| Single send module | All relay I/O goes through `src/services/send` (`sendMessage` / reconcile). Stryker mutates `send/index.ts`, `campaigns.ts`, `sms.ts` (no StringLiteral/Regex exclusions; no-cov counted). |
| Deferred recovery persisted | Quiet-hours block → `sms_messages.status='deferred'` + `next_retry_at`; cron `processDeferredRecoveries` sends when the window opens. **Never drop.** |
| Missed-call enrolls again | Non-responders enroll into Standard (urgency null). Classification switches Emergency/High on reply. **Alex: confirm non-responder path.** |
| Recovery under quiet hours | Same TCPA window as campaigns. **Alex flag:** 47 CFR 64.1200(c)(1) solicitation window — confirm whether recovery may send outside it as an informational reply. |
| Opt-out contains-keyword | Any message containing STOP/QUIT/END/REVOKE/CANCEL/UNSUBSCRIBE (after fold) → opt_out; service-talk → ambiguous. Shared list with 003 backfill. |
| Backoff persisted | `next_retry_at` on unknown rows; reconcile filters on it. ≈2.5h across 5 attempts then `needs_review`. |
| Status vocabulary | Case-insensitive; `undelivered`/`rejected`/`error` = failed; non-terminal lookup → park (no step-1 double send). |
| Terminal needs_review | Enrollment status → `needs_review` (no 30-min re-alert loop). |
| Migration 003 | Normalize phones **before** STOP backfill; collision listing first; `ON CONFLICT DO NOTHING`; abort script at `supabase/scripts/phone_collision_abort.sql` (not a migration). |
| 850 dual zones | FL panhandle 850 → Eastern **and** Central; both must be open. |
| Unmapped area codes | Unresolved; **never** fall back to business timezone. |
| E.164 on every send | Raw nationals normalized before the relay. |
| Templates | Emergency 🚨 removed for GSM-7 (1–2 segments). **Alex: confirm emergency copy.** |
| dry-run | Test-only; international last-4 redaction; in-memory idempotency. |
| Node | `engines` / `.nvmrc` → ≥22 (Stryker). |
| `ONE_GATEWAY_URL` | Unset anywhere → fail closed. Production must set explicitly. |
| `sendFollowUpSMS` | Suppression + opted_out checks restored. |

---

## How It Works

### **1. Lead Created (Missed Call)**
```
Webhook: /api/webhooks/brwn/missed-call
  ↓
Create lead (skip recovery if phone is SMS-suppressed / opted out)
  ↓
sendMessage(kind=recovery) via single send module
  (quiet hours apply; if deferred → persist next_retry_at; E.164; SENDS_ENABLED)
  ↓
Enroll into Standard (urgency null OK; switch on classified reply)
```

### **2. Customer Responds → Classify → Enroll / Switch or Pause**
```
Webhook: /api/webhooks/brwn/inbound  (leads older than 7 days ignored)
  ↓
STOP / opt-out (whole-message NFKC + confusable fold) FIRST
  ↓
Ambiguous opt-out → persist needs_human_review + pause (no auto-suppress)
  ↓
classifyUrgency → handleClassifiedReplyEnrollment
  (enrollLeadInCampaign requires urgency set; may switch Standard→Emergency)
```

### **3. Cron Job Processes Follow-ups**
```
Every 5 minutes: POST /api/cron/campaigns
  ↓
Probe relay lookup; reconcileAmbiguousSms() ORDER BY sent_at ASC
  ↓
Quiet-hours (all candidate zones must be open when ambiguous)
  ↓
Claim → insert sms_messages (mlf:campaign:…, key_supported_at_send)
  ↓
Send via BRWN
  - success / duplicate:true (non-failed) → advance
  - duplicate/failed / 409 → needs_review (never advance)
  - 429 {error:recent_send} keyed → unknown, PARK
  - timeout → unknown, PARK
```

### **Send / reconcile state machine**

Sids (always `mlf:` prefixed):
- Campaign: `mlf:campaign:{enrollmentId}:{campaignId}:step:{n}`
- Recovery: `mlf:recovery:{leadId}`

| Relay lookup outcome | Action |
|----------------------|--------|
| `sent` (non-failed) | Confirm; advance exact campaign step from sid |
| `failed` | **needs_review** — never advance |
| `never_sent` + `key_supported_at_send` | Abandon sid; requeue exact step / resend recovery |
| `never_sent` without key support | **needs_review** — never requeue (pre-upgrade / rollback safety) |
| `unknown` | Park; bump `reconcile_attempts`; after N → needs_review |

Alert on **any** parked/needs_review in a pass (and on backlog ≥ threshold).

Contract tests: `brwn-relay.test.ts` / `sms-sid.test.ts` / `qc-r4*.test.ts`.

---

## Quiet hours & opt-out

- **Quiet hours:** 08:00–21:00 lead-local (FL/OK end 20:00). Area-code map includes FL 239/448/645/656/689/728 and OK 572; **850 is Eastern AND Central** (both must be open). Unmapped codes are unresolved (no business-TZ fallback).
- **Opt-out:** whole-message after NFKC, zero-width strip, confusable fold (`STOP?`, emoji, Greek/Cyrillic look-alikes, “unsubscribe me”, “leave me alone”, …). Ambiguous → persisted `needs_human_review`.
- Templates trimmed so body + `Reply STOP to opt out.` fit one GSM-7 segment where possible.

---

## API Reference

### **Campaign Service** (`src/services/campaigns.ts`)

#### `enrollLeadInCampaign(leadId: string): Promise<EnrollmentResult>`
Auto-enrolls lead in appropriate campaign based on urgency.

**Called by**: BRWN inbound webhook **after** urgency classification (not on missed call)

**Logic:**
1. Fetch lead with urgency level (must already be set)
2. Find active campaign matching urgency (else Standard / null filter)
3. If recovery SMS already sent, skip delay-0 initial step
4. Create enrollment with next_send_at for the first *remaining* step

---

#### `sendCampaignSMS(enrollmentId: string): Promise<boolean>`
Sends SMS for current campaign step and advances sequence.

**Called by**: Cron job processor

**Logic:**
1. Fetch enrollment + lead + business + campaign
2. Get template for current step
3. Personalize template with business name
4. Queue SMS via BRWN relay
5. Record in sms_messages
6. Update enrollment (next step or completed)

---

#### `pauseCampaignForLead(leadId: string): Promise<void>`
Pauses all active campaigns for a lead.

**Called by**: SMS reply webhook when customer responds

**Logic:**
1. Find active enrollments for lead
2. Set status = 'paused'
3. Clear next_send_at
4. Set paused_at timestamp

---

#### `processDueCampaigns(): Promise<{processed, errors}>`
Processes all enrollments due for sending (cron job entry point).

**Called by**: `/api/cron/campaigns` endpoint

**Logic:**
1. Query enrollments where next_send_at <= NOW()
2. Limit to 100 per run (rate limiting)
3. Call sendCampaignSMS() for each
4. Return summary stats

---

## SMS Templates

### **Template Library** (`src/lib/templates.ts`)

All templates support variable substitution:
- `{business}` - Business name
- `{name}` - Customer name (future)
- `{issue}` - Reported issue (future)

#### **Emergency Templates**
```
emergency_initial:
"🚨 {business} - We got your call! This sounds urgent.
What's the emergency? Reply immediately and we'll prioritize your case."

emergency_followup_1:
"{business} here - Haven't heard back. Is the emergency resolved?
If you still need urgent help, reply NOW or call us directly."

emergency_followup_2:
"Final check-in from {business}. We want to make sure you're safe
and the issue is handled. Reply if you need anything else."
```

#### **High Priority Templates**
```
high_initial:
"Hi, this is {business}. We missed your call and this sounds important.
What can we help with? Reply with details and we'll respond ASAP."

high_followup_1:
"{business} checking in - We're ready to help with your issue.
Reply here or call us back at your convenience."

high_followup_2:
"Still need service from {business}? We have availability this week.
Reply YES and we'll get you scheduled."

high_followup_3:
"Last check-in from {business}. If you've found another provider, no worries!
Otherwise, we're here to help - just reply."
```

#### **Standard Templates**
```
standard_initial:
"Hi, this is {business}. Sorry we missed your call!
How can we help you today? Reply here or call us back."

standard_followup_1:
"{business} here - Just following up! Still need help?
Reply with your question or give us a call."

standard_followup_2:
"Hi from {business}! We're here when you're ready.
What can we help you with? Reply anytime."

standard_followup_3:
"{business} checking in one more time. Need a quote, service, or have questions?
We're happy to help - just reply."

standard_followup_4:
"Last message from {business}. We're always here if you need us in the future.
Have a great week!"
```

---

## Setup Instructions

### **1. Run Database Migration**

In Supabase SQL Editor, execute:
```bash
supabase/migrations/001_campaigns.sql
```

This creates:
- campaigns, campaign_steps, campaign_enrollments tables
- Enum types for campaign_status and enrollment_status
- Indexes for performance
- Seeded campaigns with default sequences

### **2. Configure 5-minute follow-up cron**

**Why not `*/5 * * * *` in `vercel.json`?**
Vercel Hobby only allows once-per-day cron; a `*/5` expression **fails the deploy**.
The daily entry in `vercel.json` (`0 9 * * *`) is kept as a Hobby-safe safety net.

**Chosen mechanism:** GitHub Actions workflow `.github/workflows/campaign-cron.yml`
runs every 5 minutes and `POST`s `/api/cron/campaigns` with `CRON_SECRET`.
That keeps send latency within minutes of `next_send_at` without requiring Vercel Pro.
`processDueCampaigns` claims enrollments before send, so overlapping triggers are safe.

If the project is upgraded to **Vercel Pro**, you may also set
`"schedule": "*/5 * * * *"` in `vercel.json` (per-minute precision). Prefer
staging URL + `MESSAGING_PROVIDER=dry-run` while validating.

**Repo secrets for the Actions cron:**
- `CRON_APP_URL` — staging (preferred) or production origin
- `CRON_SECRET` — same value as the app env var

### **3. Deploy to Vercel**

```bash
git add .
git commit -m "Add multi-touch SMS campaigns"
git push

vercel --prod
```

Cron job automatically activates on deployment.

### **4. Test Locally**

Start dev server:
```bash
npm run dev
```

Manually trigger cron:
```bash
curl http://localhost:3000/api/cron/campaigns -X POST
```

---

## Testing Campaign Flow

### **Test Auto-Enrollment (after urgency)**

1. Simulate missed call (creates lead + recovery SMS; **no** enrollment yet):
```bash
curl -X POST http://localhost:3000/api/webhooks/brwn/missed-call \
  -H "Authorization: Bearer $BRWN_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"callerPhone":"+15551234567","businessPhone":"+15559999999","callId":"TEST123","ringDurationSeconds":12}'
```

2. Simulate urgent reply (classifies + enrolls):
```bash
curl -X POST http://localhost:3000/api/webhooks/brwn/inbound \
  -H "Authorization: Bearer $BRWN_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"from":"+15551234567","to":"+15559999999","body":"Emergency flood in basement","messageId":"MSG123"}'
```

3. Check database:
```sql
SELECT c.name, ce.status, ce.current_step, ce.next_send_at, l.urgency
FROM campaign_enrollments ce
JOIN campaigns c ON c.id = ce.campaign_id
JOIN leads l ON l.id = ce.lead_id
ORDER BY ce.enrolled_at DESC
LIMIT 5;
```

Should see **Emergency Follow-up** (not Standard) with `current_step = 2` (initial skipped)
and `next_send_at` about +1 hour.

---

### **Test Campaign Sending**

1. Manually trigger cron:
```bash
curl http://localhost:3000/api/cron/campaigns -X POST
```

2. Check response:
```json
{
  "success": true,
  "processed": 1,
  "errors": 0,
  "timestamp": "2026-01-22T..."
}
```

3. Check `sms_messages` table for new outbound SMS.

---

### **Test Auto-Pause**

1. Simulate customer reply (relay inbound webhook):
```bash
curl -X POST http://localhost:3000/api/webhooks/brwn/inbound \
  -H "Authorization: Bearer $BRWN_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"from":"+15551234567","to":"+15559999999","body":"Yes I need help with my heater","messageId":"MSG123"}'
```

2. Check enrollment status:
```sql
SELECT status, paused_at FROM campaign_enrollments
WHERE lead_id = (SELECT id FROM leads WHERE caller_phone = '+15551234567');
```

Should show `status = 'paused'` with `paused_at` timestamp.

---

## Monitoring

### **Key Metrics to Track**

```sql
-- Campaign performance
SELECT
  c.name,
  COUNT(DISTINCT ce.lead_id) as enrolled_leads,
  COUNT(DISTINCT CASE WHEN ce.status = 'completed' THEN ce.lead_id END) as completed,
  COUNT(DISTINCT CASE WHEN ce.status = 'paused' THEN ce.lead_id END) as responded
FROM campaigns c
LEFT JOIN campaign_enrollments ce ON c.id = ce.campaign_id
GROUP BY c.id, c.name;

-- Response rate by step
SELECT
  cs.step_number,
  COUNT(*) as sms_sent,
  COUNT(DISTINCT CASE WHEN ce.status = 'paused' THEN ce.lead_id END) as responses
FROM campaign_steps cs
LEFT JOIN campaign_enrollments ce ON cs.campaign_id = ce.campaign_id
  AND cs.step_number <= ce.current_step
GROUP BY cs.step_number
ORDER BY cs.step_number;

-- Due messages (should be processed by cron)
SELECT COUNT(*) as due_count
FROM campaign_enrollments
WHERE status = 'active'
  AND next_send_at <= NOW();
```

---

## Troubleshooting

### **Campaign not sending**

**Check 1**: Is cron configured?
```bash
vercel crons ls
```

**Check 2**: Are enrollments due?
```sql
SELECT * FROM campaign_enrollments
WHERE status = 'active' AND next_send_at <= NOW();
```

**Check 3**: Check cron logs in Vercel dashboard

---

### **Lead not enrolled**

**Check 1**: Verify campaign exists and is active
```sql
SELECT * FROM campaigns WHERE status = 'active';
```

**Check 2**: Check webhook logs (call-status endpoint)

**Check 3**: Verify enrollLeadInCampaign was called

---

### **SMS not pausing on response**

**Check 1**: Verify SMS reply webhook called pauseCampaignForLead

**Check 2**: Check enrollment status
```sql
SELECT status FROM campaign_enrollments WHERE lead_id = '...';
```

---

## Performance Considerations

- **Rate Limiting**: 200ms delay between SMS sends in processDueCampaigns()
- **Batch Size**: Max 100 enrollments processed per cron run
- **Indexes**: Optimized queries with next_send_at index
- **SMS Costs**: Carrier rates via the BRWN device SIM (no Twilio per-message fee)

---

## Future Enhancements

- [ ] A/B testing for template variations
- [ ] Custom templates per business
- [ ] SMS delivery status webhooks
- [ ] Campaign analytics dashboard
- [ ] Manual campaign triggers
- [ ] Opt-out handling (STOP keyword)
- [ ] Time zone awareness for send times
- [ ] Business hours respect (don't send at 2am)

---

## Files Created

```
supabase/migrations/001_campaigns.sql     # Database schema
src/lib/templates.ts                      # SMS template library
src/services/campaigns.ts                 # Campaign logic
src/app/api/cron/campaigns/route.ts       # Vercel cron endpoint
vercel.json                               # Cron configuration
CAMPAIGNS.md                              # This file
```

## Files Modified

```
src/types/database.ts                            # Added campaign table types
src/app/api/webhooks/brwn/missed-call/route.ts    # Auto-enrollment on miss
src/app/api/webhooks/brwn/inbound/route.ts        # Auto-pause on reply
```
