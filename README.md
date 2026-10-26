# Missed Call Recovery

Automated missed-call recovery for service businesses. When a call goes unanswered, the caller gets a text back within seconds. AI then sorts their reply by urgency, and emergency/high leads get escalated right away. Non-responders stay in a multi-touch SMS campaign until they reply or the sequence ends.

## Features

- **Missed-call detection** through Twilio voice status webhooks (`no-answer`, `busy`, `failed`) with **Twilio request signature verification**
- **Instant recovery SMS** sent to the caller
- **AI urgency sorting** via [One Gateway](https://github.com/abrown84/one-gateway) (OpenAI-compatible; default model `gemini-3.8-flash`, overridable via `ONE_GATEWAY_MODEL`) — emergency / high / normal / low — using prompts tailored to each trade, plus a keyword fallback
- **Escalation** of emergency and high-urgency leads (SMS to the business emergency number)
- **Multi-touch follow-up campaigns** with auto-enrollment, pause-on-reply, and a Vercel cron processor (`/api/cron/campaigns`) protected by `CRON_SECRET`
- **Dashboard** with stats, a leads table, lead detail panel, and Supabase Realtime updates
- **Auth** with Supabase email/password (`/login`, `/signup`) — middleware gates UI; dashboard APIs require a session

## How it works

```
Customer calls → missed → Twilio call-status webhook (signature checked)
  → record missed call + create lead → send recovery SMS
  → enroll lead in multi-touch campaign
  → customer replies → sms-reply webhook (signature checked) → One Gateway classifies urgency
  → emergency/high? escalate now; pause campaign
  → otherwise stay queued for remaining campaign steps
```

## Tech stack

Next.js 15 (App Router) · TypeScript · Supabase (Postgres + Auth) · Twilio (Voice + SMS) · One Gateway (LLM) · Tailwind · Vitest · Vercel

All AI/LLM traffic goes through [One Gateway](https://github.com/abrown84/one-gateway) (`POST /v1/chat/completions`). This app never calls Google or OpenAI directly.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Supabase, Twilio, CRON_SECRET, One Gateway
npm run dev
```

1. Create a Supabase project and run `supabase/schema.sql`, then `supabase/migrations/001_campaigns.sql`, then `supabase/migrations/002_secure_rls.sql` (if upgrading an existing DB that still has open RLS policies). Enable email auth in Authentication settings.
2. Ensure [One Gateway](https://github.com/abrown84/one-gateway) is reachable (default `https://brwnindustries.com/labs/one-gateway`; app calls `…/v1/chat/completions`). Override with `ONE_GATEWAY_URL` if needed.
3. In the Twilio Console, set your number's:
   - Voice status callback: `https://YOUR-DOMAIN/api/webhooks/twilio/call-status`
   - Messaging webhook: `https://YOUR-DOMAIN/api/webhooks/twilio/sms-reply`
4. Set `NEXT_PUBLIC_APP_URL` to that same public origin so Twilio signature validation matches the URL Twilio signed.
5. Set `CRON_SECRET` (required). On Vercel, also add it under Project Settings so Cron jobs send `Authorization: Bearer $CRON_SECRET`.

### Environment variables

| Variable | Required | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Browser / SSR Supabase clients |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | API routes (`src/lib/supabase.ts`) — server only |
| `TWILIO_ACCOUNT_SID` | yes | Twilio client |
| `TWILIO_AUTH_TOKEN` | yes | Twilio client + webhook signature checks |
| `NEXT_PUBLIC_APP_URL` | yes (prod) | Twilio signature URL + redirects |
| `CRON_SECRET` | yes (prod) | Bearer auth for `/api/cron/campaigns` |

Optional: `ONE_GATEWAY_URL` (default `https://brwnindustries.com/labs/one-gateway`; remote must be `https://`), `ONE_GATEWAY_MODEL` (default `gemini-3.8-flash`), `ONE_GATEWAY_TOKEN` (Bearer auth only if set), `ONE_GATEWAY_AGENT` (default `main`), `ONE_GATEWAY_TIMEOUT_MS` (default `45000`).

## Scripts

```bash
npm run dev          # local Next.js server
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit tests (no network / no paid APIs)
npm run build        # production build
```

CI (GitHub Actions) runs lint, typecheck, tests, and build on every PR.

## Security notes

- Twilio webhooks reject requests that fail `X-Twilio-Signature` validation.
- Dashboard API routes (`/api/leads`, `/api/stats`, `/api/chat`) require a Supabase session.
- Cron rejects requests unless `Authorization: Bearer $CRON_SECRET` matches (timing-safe).
- RLS is deny-by-default for anon/authenticated keys; server routes use the service role after auth checks.
- Logs redact phone numbers (last-4 only). Do not commit `.env.local` or real credentials.

## Roadmap

- Business onboarding flow (per-user / per-business tenancy)
- Voice AI fallback

---

Built by [Brown Industries](https://brwnindustries.com). Need this for your business? [Book an AI Ops Audit](https://brwnindustries.com/ai-ops).
