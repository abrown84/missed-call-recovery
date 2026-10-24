# Missed Call Recovery

Automated missed-call recovery for service businesses. When a call goes unanswered, the caller gets a text back within seconds. AI then sorts their reply by urgency, and emergency/high leads get escalated right away. Non-responders stay in a multi-touch SMS campaign until they reply or the sequence ends.

## Features

- **Missed-call detection** through Twilio voice status webhooks (`no-answer`, `busy`, `failed`)
- **Instant recovery SMS** sent to the caller
- **AI urgency sorting** via [One Gateway](https://github.com/abrown84/one-gateway) (OpenAI-compatible; default model `gemini-3.8-flash`, overridable via `ONE_GATEWAY_MODEL`) — emergency / high / normal / low — using prompts tailored to each trade, plus a keyword fallback
- **Escalation** of emergency and high-urgency leads (SMS to the business emergency number)
- **Multi-touch follow-up campaigns** with auto-enrollment, pause-on-reply, and a Vercel cron processor (`/api/cron/campaigns`)
- **Dashboard** with stats, a leads table, lead detail panel, and Supabase Realtime updates
- **Auth** with Supabase email/password (`/login`, `/signup`)

## How it works

```
Customer calls → missed → Twilio call-status webhook
  → record missed call + create lead → send recovery SMS
  → enroll lead in multi-touch campaign
  → customer replies → sms-reply webhook → One Gateway classifies urgency
  → emergency/high? escalate now; pause campaign
  → otherwise stay queued for remaining campaign steps
```

## Tech stack

Next.js 14 (App Router) · TypeScript · Supabase (Postgres + Auth) · Twilio (Voice + SMS) · One Gateway (LLM) · Tailwind · Vercel

All AI/LLM traffic goes through [One Gateway](https://github.com/abrown84/one-gateway) (`POST /v1/chat/completions`). This app never calls Google or OpenAI directly.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Supabase, Twilio, One Gateway
npm run dev
```

1. Create a Supabase project and run `supabase/schema.sql`, then `supabase/migrations/001_campaigns.sql`. Enable email auth in Authentication settings.
2. Ensure [One Gateway](https://github.com/abrown84/one-gateway) is reachable (default `https://brwnindustries.com/labs/one-gateway`; app calls `…/v1/chat/completions`). Override with `ONE_GATEWAY_URL` if needed.
3. In the Twilio Console, set your number's:
   - Voice status callback: `https://YOUR-DOMAIN/api/webhooks/twilio/call-status`
   - Messaging webhook: `https://YOUR-DOMAIN/api/webhooks/twilio/sms-reply`

Required env vars (see `.env.example`):

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser / SSR Supabase clients |
| `SUPABASE_SERVICE_ROLE_KEY` | API routes (`src/lib/supabase.ts`) |
| `TWILIO_ACCOUNT_SID` | Twilio client |
| `TWILIO_AUTH_TOKEN` | Twilio client |

Optional: `ONE_GATEWAY_URL` (default `https://brwnindustries.com/labs/one-gateway`; remote must be `https://`), `ONE_GATEWAY_MODEL` (default `gemini-3.8-flash`), `ONE_GATEWAY_TOKEN` (Bearer auth only if set), `NEXT_PUBLIC_APP_URL` (app base URL), `CRON_SECRET` (Bearer auth for `/api/cron/campaigns`), `ONE_GATEWAY_AGENT` (OpenClaw agent id, default `main`), `ONE_GATEWAY_TIMEOUT_MS` (default `45000`).

## Roadmap

- Business onboarding flow
- Voice AI fallback

---

Built by [Brown Industries](https://brwnindustries.com). Need this for your business? [Book an AI Ops Audit](https://brwnindustries.com/ai-ops).
