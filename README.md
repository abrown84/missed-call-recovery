# Missed Call Recovery

Automated missed-call recovery for service businesses. The client's phone (BRWN Text Android app today; Mac node for iPhone later) detects a missed call, this app records the lead, and a recovery SMS is queued through the [BRWN Text relay](https://brwnindustries.com). AI then sorts replies by urgency; emergency/high leads escalate immediately. Non-responders stay in a multi-touch SMS campaign until they reply or the sequence ends.

## Features

- **Missed-call detection on-device** — authenticated `POST /api/webhooks/brwn/missed-call` (Bearer `BRWN_WEBHOOK_SECRET`)
- **Instant recovery SMS** via BRWN relay (`POST {BRWN_RELAY_URL}/api/messages` with sender token); the paired Android node long-polls and sends the text
- **Inbound replies** from the relay webhook → `POST /api/webhooks/brwn/inbound`
- **Delivery status** updates via `POST /api/webhooks/brwn/status`
- **AI urgency sorting** via [One Gateway](https://github.com/abrown84/one-gateway) (default model `gemini-3.8-flash`) plus keyword fallback
- **Escalation** of emergency and high-urgency leads (SMS via the same relay)
- **Multi-touch follow-up campaigns** with Vercel cron (`/api/cron/campaigns`) protected by `CRON_SECRET`
- **Dashboard** with stats, leads, detail panel, Supabase Realtime
- **Auth** with Supabase email/password — middleware gates UI; dashboard APIs require a session

## How it works

```
Customer calls business phone → device detects miss
  → POST /api/webhooks/brwn/missed-call (Bearer BRWN_WEBHOOK_SECRET)
  → record missed call + create lead
  → queue recovery SMS on BRWN relay (sender token → /api/messages)
  → Android node long-polls relay → sends SMS
  → customer replies → relay stores inbound → fires webhook
  → POST /api/webhooks/brwn/inbound → One Gateway classifies urgency
  → emergency/high? escalate; pause campaign
```

> **Gap:** Missed-call *detection* lives in the BRWN Android app (not this repo). This app only consumes the authenticated event and drives recovery. A Mac node for iPhone users is planned later.

## Tech stack

Next.js 15 (App Router) · TypeScript · Supabase (Postgres + Auth) · BRWN Text relay (SMS) · One Gateway (LLM) · Tailwind · Vitest · Vercel

Twilio is **not** used. All outbound SMS goes through the messaging adapter (`MESSAGING_PROVIDER=brwn-relay` by default).

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Supabase, BRWN relay, CRON_SECRET, One Gateway
npm run dev
```

1. Create a Supabase project and run `supabase/schema.sql`, then `supabase/migrations/001_campaigns.sql`, then `supabase/migrations/002_secure_rls.sql` (if upgrading). Enable email auth.
2. Ensure the BRWN Text relay is reachable and a device is paired (sender + device tokens).
3. Point the relay inbound webhook at this app:
   ```bash
   # on the relay host
   ./set_webhook.sh \
     "https://YOUR-DOMAIN/api/webhooks/brwn/inbound" \
     "Bearer $BRWN_WEBHOOK_SECRET"
   ```
4. Configure the BRWN device (or companion) to `POST` missed-call events to  
   `https://YOUR-DOMAIN/api/webhooks/brwn/missed-call` with the same Bearer secret.
5. Set `CRON_SECRET` (required). On Vercel, Cron sends `Authorization: Bearer $CRON_SECRET` when the env var is set.

### Environment variables

| Variable | Required | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Browser / SSR Supabase clients |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | API routes — server only |
| `BRWN_RELAY_URL` | yes | Outbound SMS base URL |
| `BRWN_RELAY_SENDER_TOKEN` | yes | Bearer on `POST /api/messages` |
| `BRWN_WEBHOOK_SECRET` | yes | Bearer on missed-call / inbound / status webhooks |
| `BRWN_DEFAULT_BUSINESS_PHONE` | recommended | Fallback when inbound webhook omits `to` |
| `NEXT_PUBLIC_APP_URL` | yes (prod) | App origin / redirects |
| `CRON_SECRET` | yes (prod) | Bearer auth for `/api/cron/campaigns` |

Optional: `BRWN_RELAY_TIMEOUT_MS` (default `15000`), `MESSAGING_PROVIDER` (default `brwn-relay`), `ONE_GATEWAY_URL` / `MODEL` / `TOKEN` / `AGENT` / `TIMEOUT_MS`.

**Removed (Twilio):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`. Delete them from Vercel after cutover. Remove Twilio Console voice/SMS webhook URLs for this product.

## Scripts

```bash
npm run dev          # local Next.js server
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest (relay mocked; no live SMS)
npm run build        # production build
```

CI (GitHub Actions) runs lint, typecheck, tests, and build on every PR.

## Security notes

- BRWN webhooks reject requests unless `Authorization: Bearer $BRWN_WEBHOOK_SECRET` matches (timing-safe).
- Dashboard API routes require a Supabase session.
- Cron requires `Authorization: Bearer $CRON_SECRET`.
- RLS is deny-by-default for anon/authenticated keys; server routes use the service role after auth checks.
- Logs redact phone numbers (last-4 only). Do not commit `.env.local` or real credentials.

## Roadmap

- Business onboarding flow (per-user / per-business tenancy)
- Mac / iPhone BRWN node
- Voice AI fallback

---

Built by [Brown Industries](https://brwnindustries.com). Need this for your business? [Book an AI Ops Audit](https://brwnindustries.com/ai-ops).
