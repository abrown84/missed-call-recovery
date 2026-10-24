# Missed Call Recovery Platform

## Overview
Automated inbound recovery system for service businesses. Detects missed calls via Twilio webhooks, sends instant SMS outreach, classifies urgency with AI (Gemini Flash), and escalates high-priority leads.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL + Auth)
- **Telephony**: Twilio (Voice + SMS)
- **AI**: One Gateway → model (default `gemini-3.8-flash`; urgency classification)
- **Deployment**: Vercel
- **Language**: TypeScript

## Project Structure
```
src/
├── app/
│   ├── api/
│   │   ├── webhooks/twilio/     # Twilio webhook handlers
│   │   ├── leads/               # Lead management API
│   │   └── stats/               # Dashboard stats API
│   ├── login/                   # Auth pages
│   ├── signup/
│   └── page.tsx                 # Main dashboard
├── components/
│   ├── dashboard/               # StatsCards, LeadsTable, LeadDetail
│   └── ui/                      # Card, Badge
├── lib/
│   ├── supabase.ts              # Supabase client (API routes)
│   ├── supabase-browser.ts      # Supabase client (browser)
│   ├── supabase-server.ts       # Supabase client (server components)
│   ├── twilio.ts                # Twilio client
│   └── gemini.ts                # One Gateway AI client (legacy geminiFlash shim)
├── services/
│   ├── classification.ts        # AI urgency classification
│   ├── sms.ts                   # SMS outreach
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
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
# Optional — defaults to https://brwnindustries.com/labs/one-gateway + gemini-3.8-flash
# ONE_GATEWAY_URL=https://brwnindustries.com/labs/one-gateway
# ONE_GATEWAY_MODEL=gemini-3.8-flash
# ONE_GATEWAY_TOKEN=xxx   # Authorization sent only if set
```

**Vercel**: Add same vars in Project Settings → Environment Variables. Gateway URL/model have production defaults; set `ONE_GATEWAY_TOKEN` only if the gateway requires auth.

### 3. Twilio Configuration
In Twilio Console, configure your phone number:
- **Voice → Status Callback URL**: `https://YOUR-DOMAIN.vercel.app/api/webhooks/twilio/call-status`
- **Messaging → Webhook URL**: `https://YOUR-DOMAIN.vercel.app/api/webhooks/twilio/sms-reply`

### 4. Development
```bash
npm install
npm run dev
```

## Flow
```
Customer calls → Missed → Twilio webhook
                              ↓
              /api/webhooks/twilio/call-status
                              ↓
              Record missed call + Create lead
                              ↓
              Send recovery SMS (within 10 seconds)
                              ↓
              Customer replies → /api/webhooks/twilio/sms-reply
                              ↓
              AI classifies urgency (Gemini Flash)
                              ↓
              Emergency? → Escalate immediately
              Otherwise  → Queue for follow-up
```

## Urgency Classification
Uses Gemini Flash with vertical-aware prompts:
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
- [x] Twilio webhooks (call status, SMS reply)
- [x] AI urgency classification (One Gateway / gemini-3.8-flash)
- [x] SMS outreach + escalation
- [x] Dashboard UI (stats, leads, detail panel)
- [x] Authentication (Supabase Auth)
- [x] Vercel deployment

## TODO
- [ ] Business onboarding flow
- [ ] Multi-touch follow-up logic
- [ ] Real-time updates (Supabase Realtime)
- [ ] Voice AI fallback (roadmap)
