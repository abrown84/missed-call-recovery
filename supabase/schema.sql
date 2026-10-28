-- Missed Call Recovery Platform - Database Schema
-- Run this in Supabase SQL Editor to set up your database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types
CREATE TYPE urgency_level AS ENUM ('emergency', 'high', 'normal', 'low');
CREATE TYPE lead_status AS ENUM ('pending', 'responded', 'qualified', 'escalated', 'converted', 'lost', 'spam');
CREATE TYPE vertical_type AS ENUM ('plumbing', 'hvac', 'electrical', 'locksmith', 'restoration', 'roofing', 'pest_control', 'general');

-- Businesses table
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,  -- Business phone (BRWN device SIM / line)

  vertical vertical_type DEFAULT 'general',
  timezone TEXT DEFAULT 'America/New_York',
  business_hours_start TIME DEFAULT '08:00',
  business_hours_end TIME DEFAULT '18:00',
  after_hours_enabled BOOLEAN DEFAULT true,
  emergency_phone TEXT,  -- Escalation number
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Missed calls table
CREATE TABLE missed_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  caller_phone TEXT NOT NULL,
  called_at TIMESTAMPTZ DEFAULT NOW(),
  ring_duration INTEGER DEFAULT 0,  -- seconds
  call_sid TEXT NOT NULL UNIQUE,    -- Device call id (unique per missed call)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads table
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  missed_call_id UUID NOT NULL REFERENCES missed_calls(id) ON DELETE CASCADE,
  caller_phone TEXT NOT NULL,
  status lead_status DEFAULT 'pending',
  urgency urgency_level,
  issue TEXT,
  sms_outbound_sid TEXT,
  sms_response_text TEXT,
  classified_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  estimated_value DECIMAL(10,2),
  opted_out BOOLEAN NOT NULL DEFAULT false,
  opted_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SMS messages table
CREATE TABLE sms_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  message_sid TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phone-level suppression (STOP / wrong number) across future missed calls
CREATE TABLE sms_suppressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, phone)
);

-- Emergency keywords by vertical
CREATE TABLE emergency_keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vertical vertical_type NOT NULL,
  keyword TEXT NOT NULL,
  weight INTEGER DEFAULT 1,  -- Higher = more indicative of emergency
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_missed_calls_business ON missed_calls(business_id);
CREATE INDEX idx_missed_calls_called_at ON missed_calls(called_at);
CREATE INDEX idx_leads_business ON leads(business_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_urgency ON leads(urgency);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_sms_messages_lead ON sms_messages(lead_id);
CREATE INDEX idx_emergency_keywords_vertical ON emergency_keywords(vertical);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger
CREATE TRIGGER businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed emergency keywords
INSERT INTO emergency_keywords (vertical, keyword, weight) VALUES
  -- Plumbing emergencies
  ('plumbing', 'flood', 10),
  ('plumbing', 'flooding', 10),
  ('plumbing', 'burst', 9),
  ('plumbing', 'leak', 7),
  ('plumbing', 'water everywhere', 10),
  ('plumbing', 'sewage', 9),
  ('plumbing', 'backup', 8),
  ('plumbing', 'no water', 8),
  ('plumbing', 'emergency', 10),
  ('plumbing', 'urgent', 8),
  ('plumbing', 'asap', 7),

  -- HVAC emergencies
  ('hvac', 'no heat', 9),
  ('hvac', 'no ac', 8),
  ('hvac', 'no cooling', 8),
  ('hvac', 'furnace out', 9),
  ('hvac', 'gas smell', 10),
  ('hvac', 'carbon monoxide', 10),
  ('hvac', 'freezing', 9),
  ('hvac', 'emergency', 10),
  ('hvac', 'urgent', 8),

  -- Electrical emergencies
  ('electrical', 'no power', 8),
  ('electrical', 'sparks', 10),
  ('electrical', 'burning smell', 10),
  ('electrical', 'shock', 9),
  ('electrical', 'fire', 10),
  ('electrical', 'outage', 7),
  ('electrical', 'emergency', 10),
  ('electrical', 'urgent', 8),

  -- General emergency indicators
  ('general', 'emergency', 10),
  ('general', 'urgent', 8),
  ('general', 'asap', 7),
  ('general', 'immediately', 8),
  ('general', 'right now', 7),
  ('general', 'help', 6);

-- Row Level Security (RLS)
-- IMPORTANT: Do NOT add USING (true) policies — that opens tables to the anon key.
-- The service role key used by API routes bypasses RLS. Authenticated dashboard
-- access goes through Next.js API routes that use the service role after session checks.
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE missed_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_keywords ENABLE ROW LEVEL SECURITY;

-- Deny-by-default for anon/authenticated clients (no permissive policies).
-- Service role bypasses RLS for server-side webhooks and authenticated API handlers.
