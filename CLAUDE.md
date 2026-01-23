# Missed Call Recovery Platform

## Overview
Automated inbound recovery system for service businesses. Detects missed calls via Twilio webhooks, sends instant SMS outreach, classifies urgency, and escalates high-priority leads.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Telephony**: Twilio (Voice + SMS)
- **Language**: TypeScript

## Project Structure
```
src/
├── app/
│   ├── api/
│   │   ├── webhooks/twilio/     # Twilio webhook handlers
│   │   │   ├── call-status/     # Missed call detection
│   │   │   └── sms-reply/       # SMS response handler
│   │   └── leads/               # Lead management API
│   └── page.tsx                 # Dashboard (TODO)
├── lib/
│   ├── supabase.ts              # Supabase client
│   └── twilio.ts                # Twilio client
├── services/
│   ├── classification.ts       # Urgency classification
│   ├── sms.ts                   # SMS outreach
│   └── escalation.ts           # Lead escalation
└── types/
    ├── index.ts                # Domain types
    └── database.ts             # Supabase types
```

## Setup

### 1. Environment Variables
Copy `.env.example` to `.env.local` and fill in:
- Supabase URL and keys
- Twilio credentials

### 2. Database
Run `supabase/schema.sql` in Supabase SQL Editor.

### 3. Twilio Configuration
Configure webhooks in Twilio console:
- **Voice Status Callback**: `https://your-domain.com/api/webhooks/twilio/call-status`
- **SMS Webhook**: `https://your-domain.com/api/webhooks/twilio/sms-reply`

### 4. Development
```bash
npm install
npm run dev
```

## Flow
1. Inbound call → Twilio → missed (no-answer/busy)
2. Webhook triggers `/api/webhooks/twilio/call-status`
3. System records missed call, creates lead, sends recovery SMS
4. Customer replies → `/api/webhooks/twilio/sms-reply`
5. System classifies urgency using keyword matching
6. Emergency/high-urgency → immediate escalation to owner/dispatcher

## Key Concepts

### Urgency Levels
- `emergency`: Immediate danger or critical failure (flood, gas leak, fire)
- `high`: Urgent but not dangerous (no heat in winter, no AC in summer)
- `normal`: Standard service request
- `low`: Quote requests, scheduling for future

### Lead Statuses
- `pending`: SMS sent, awaiting response
- `responded`: Customer replied
- `qualified`: Urgency classified
- `escalated`: Sent to dispatcher
- `converted`: Job booked
- `lost`: No response
- `spam`: Opt-out or junk

## TODO
- [ ] Dashboard UI
- [ ] Business onboarding flow
- [ ] Multi-touch follow-up logic
- [ ] Analytics dashboard
- [ ] Voice AI fallback (roadmap)
