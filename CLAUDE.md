# Missed Call Recovery Platform

## Overview
Automated inbound recovery system for service businesses. The client's phone (BRWN Text Android app) detects missed calls and posts authenticated events here; this app queues recovery SMS through the BRWN Text relay, classifies urgency with AI (One Gateway / Gemini Flash), and escalates high-priority leads.

## Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase (PostgreSQL + Auth)
- **Messaging**: BRWN Text relay (Android device node; Mac later)
- **AI**: One Gateway → model (default `gemini-3.8-flash`; urgency classification)
- **Deployment**: Vercel
- **Language**: TypeScript

## Project Structure
```
src/
├── app/
│   ├── api/
│   │   ├── webhooks/brwn/       # Missed-call, inbound, status (Bearer auth)
│   │   ├── leads/               # Lead management API
│   │   └── stats/               # Dashboard stats API
│   ├── login/                   # Auth pages
│   ├── signup/
│   └── page.tsx                 # Main dashboard
├── components/
│   ├── dashboard/               # StatsCards, LeadsTable, LeadDetail
│   └── ui/                      # Card, Badge
├── lib/
│   ├── messaging/               # Adapter interface + BRWN relay client
│   ├── supabase.ts              # Supabase client (API routes)
│   ├── supabase-browser.ts      # Supabase client (browser)
│   ├── supabase-server.ts       # Supabase client (server components)
│   └── gemini.ts                # One Gateway AI client (legacy geminiFlash shim)
├── services/
│   ├── missed-call.ts           # Process device missed-call events
│   ├── inbound.ts               # Process inbound SMS
│   ├── classification.ts        # AI urgency classification
│   ├── sms.ts                   # SMS outreach via messaging adapter
│   └── escalation.ts            # Lead escalation
└── middleware.ts                # Auth protection
```

## Setup

### 1. Supabase Setup
1. Create project at https://supabase.com
2. Run `supabase/schema.sql` in SQL Editor
3. Enable Email auth in Authentication settings
4. Set Site URL to your Vercel domain

### 2. Environment Variables

**Local** (`.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
BRWN_RELAY_URL=https://relay.example.com
BRWN_RELAY_SENDER_TOKEN=xxx
BRWN_WEBHOOK_SECRET=xxx
CRON_SECRET=xxx
# Optional — defaults to https://brwnindustries.com/labs/one-gateway + gemini-3.8-flash
# ONE_GATEWAY_URL=https://brwnindustries.com/labs/one-gateway
# ONE_GATEWAY_MODEL=gemini-3.8-flash
# ONE_GATEWAY_TOKEN=xxx # Authorization sent only if set
```

**Vercel**: Add same vars in Project Settings → Environment Variables. Remove any leftover `TWILIO_*` vars.

### 3. BRWN Configuration
- Relay inbound webhook: `https://YOUR-DOMAIN/api/webhooks/brwn/inbound` with `Authorization: Bearer $BRWN_WEBHOOK_SECRET`
- Device missed-call events: `https://YOUR-DOMAIN/api/webhooks/brwn/missed-call` (same Bearer)
- Optional status: `https://YOUR-DOMAIN/api/webhooks/brwn/status`

### 4. Development
```bash
npm install
npm run dev
```

## Flow
```
Customer calls → device detects miss
              ↓
              /api/webhooks/brwn/missed-call
              ↓
              Record missed call + Create lead
              ↓
              Queue recovery SMS on BRWN relay
              ↓
              Customer replies → relay webhook → /api/webhooks/brwn/inbound
              ↓
              AI classifies urgency (One Gateway)
              ↓
              Emergency? → Escalate immediately
              Otherwise → Queue for follow-up
```

## Urgency Classification
Uses Gemini Flash (via One Gateway) with vertical-aware prompts:
- **emergency**: Active danger/damage (flood, gas leak, fire)
- **high**: Urgent service need (no heat, no AC, no power)
- **normal**: Standard service request
- **low**: Quote requests, future scheduling

Falls back to keyword matching if AI unavailable.

## Auth
- Supabase Auth with email/password
- Protected routes via middleware
- Login at `/login`, signup at `/signup`

## Done
- [x] BRWN relay messaging adapter (default)
- [x] Authenticated missed-call / inbound / status webhooks
- [x] AI urgency classification (One Gateway / gemini-3.8-flash)
- [x] SMS outreach + escalation via relay
- [x] Dashboard UI (stats, leads, detail panel)
- [x] Authentication (Supabase Auth)
- [x] Vercel deployment

## TODO
- [ ] Business onboarding flow
- [ ] Multi-touch follow-up polish
- [ ] Real-time updates (Supabase Realtime)
- [ ] Mac / iPhone BRWN node
- [ ] Voice AI fallback (roadmap)
