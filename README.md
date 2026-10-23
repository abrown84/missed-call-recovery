# Missed Call Recovery

Automated missed-call recovery for service businesses. When a call goes unanswered, the caller gets a text back within seconds. AI then sorts their reply by urgency, and emergency/high leads get escalated right away. Non-responders stay in a multi-touch SMS campaign until they reply or the sequence ends.

## Features

- **Missed-call detection** through Twilio voice status webhooks (`no-answer`, `busy`, `failed`)
- **Instant recovery SMS** sent to the caller
- **AI urgency sorting** with Google Gemini Flash (`gemini-2.0-flash`) — emergency / high / normal / low — using prompts tailored to each trade, plus a keyword fallback
- **Escalation** of emergency and high-urgency leads (SMS to the business emergency number)
- **Multi-touch follow-up campaigns** with auto-enrollment, pause-on-reply, and a Vercel cron processor (`/api/cron/campaigns`)
- **Dashboard** with stats, a leads table, lead detail panel, and Supabase Realtime updates
- **Auth** with Supabase email/password (`/login`, `/signup`)

## How it works

```
Customer calls → missed → Twilio call-status webhook
  → record missed call + create lead → send recovery SMS
  → enroll lead in multi-touch campaign
  → customer replies → sms-reply webhook → Gemini classifies urgency
  → emergency/high? escalate now; pause campaign
  → otherwise stay queued for remaining campaign steps
```

## Tech stack

Next.js 14 (App Router) · TypeScript · Supabase (Postgres + Auth) · Twilio (Voice + SMS) · Google Gemini Flash · Tailwind · Vercel

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Supabase, Twilio, Gemini keys
npm run dev
```

1. Create a Supabase project and run `supabase/schema.sql`, then `supabase/migrations/001_campaigns.sql`. Enable email auth in Authentication settings.
2. In the Twilio Console, set your number's:
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
| `GOOGLE_GEMINI_API_KEY` | Gemini classification |

Optional: `NEXT_PUBLIC_APP_URL` (app base URL), `CRON_SECRET` (Bearer auth for `/api/cron/campaigns`).

## Roadmap

- Business onboarding flow
- Voice AI fallback

---

Built by [Brown Industries](https://brwnindustries.com). Need this for your business? [Book an AI Ops Audit](https://brwnindustries.com/ai-ops).
