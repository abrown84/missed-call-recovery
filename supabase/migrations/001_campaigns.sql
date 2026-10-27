-- Multi-Touch SMS Campaign System
-- Add campaigns, campaign_steps, and campaign_enrollments tables

-- Campaign status enum
CREATE TYPE campaign_status AS ENUM ('active', 'paused', 'archived');

-- Enrollment status enum
CREATE TYPE enrollment_status AS ENUM ('active', 'paused', 'completed', 'opted_out');

-- Campaigns table - defines multi-touch sequences
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  vertical vertical_type DEFAULT 'general',
  urgency_filter urgency_level,  -- null = all urgencies
  status campaign_status DEFAULT 'active',
  auto_enroll BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign steps - defines each touch in the sequence
CREATE TABLE campaign_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  delay_minutes INTEGER NOT NULL,  -- Delay from previous step (or lead creation for step 1)
  template_key TEXT NOT NULL,  -- Key to look up template
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, step_number)
);

-- Campaign enrollments - tracks leads in campaigns
CREATE TABLE campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 1,
  status enrollment_status DEFAULT 'active',
  next_send_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, campaign_id)
);

-- Indexes for performance
CREATE INDEX idx_campaigns_vertical ON campaigns(vertical);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaign_steps_campaign ON campaign_steps(campaign_id, step_number);
CREATE INDEX idx_enrollments_lead ON campaign_enrollments(lead_id);
CREATE INDEX idx_enrollments_campaign ON campaign_enrollments(campaign_id);
CREATE INDEX idx_enrollments_status ON campaign_enrollments(status);
CREATE INDEX idx_enrollments_next_send ON campaign_enrollments(next_send_at) WHERE status = 'active';

-- Trigger for updated_at
CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER campaign_enrollments_updated_at
  BEFORE UPDATE ON campaign_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: enable and leave deny-by-default (service role bypasses RLS).
-- Do not add USING (true) policies — see 002_secure_rls.sql.
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_enrollments ENABLE ROW LEVEL SECURITY;

-- Seed default campaigns
INSERT INTO campaigns (name, description, vertical, urgency_filter, auto_enroll) VALUES
  ('Emergency Follow-up', '3-touch sequence for emergency leads', 'general', 'emergency', true),
  ('High Priority Follow-up', '4-touch sequence for high urgency leads', 'general', 'high', true),
  ('Standard Follow-up', '5-touch sequence for normal/low urgency leads', 'general', NULL, true);

-- Seed campaign steps
-- Emergency campaign (fast cadence)
INSERT INTO campaign_steps (campaign_id, step_number, delay_minutes, template_key)
SELECT id, 1, 0, 'emergency_initial' FROM campaigns WHERE name = 'Emergency Follow-up'
UNION ALL
SELECT id, 2, 60, 'emergency_followup_1' FROM campaigns WHERE name = 'Emergency Follow-up'  -- 1 hour
UNION ALL
SELECT id, 3, 240, 'emergency_followup_2' FROM campaigns WHERE name = 'Emergency Follow-up';  -- 4 hours

-- High priority campaign
INSERT INTO campaign_steps (campaign_id, step_number, delay_minutes, template_key)
SELECT id, 1, 0, 'high_initial' FROM campaigns WHERE name = 'High Priority Follow-up'
UNION ALL
SELECT id, 2, 120, 'high_followup_1' FROM campaigns WHERE name = 'High Priority Follow-up'  -- 2 hours
UNION ALL
SELECT id, 3, 1440, 'high_followup_2' FROM campaigns WHERE name = 'High Priority Follow-up'  -- 24 hours
UNION ALL
SELECT id, 4, 4320, 'high_followup_3' FROM campaigns WHERE name = 'High Priority Follow-up';  -- 3 days

-- Standard campaign
INSERT INTO campaign_steps (campaign_id, step_number, delay_minutes, template_key)
SELECT id, 1, 0, 'standard_initial' FROM campaigns WHERE name = 'Standard Follow-up'
UNION ALL
SELECT id, 2, 240, 'standard_followup_1' FROM campaigns WHERE name = 'Standard Follow-up'  -- 4 hours
UNION ALL
SELECT id, 3, 1440, 'standard_followup_2' FROM campaigns WHERE name = 'Standard Follow-up'  -- 24 hours
UNION ALL
SELECT id, 4, 4320, 'standard_followup_3' FROM campaigns WHERE name = 'Standard Follow-up'  -- 3 days
UNION ALL
SELECT id, 5, 10080, 'standard_followup_4' FROM campaigns WHERE name = 'Standard Follow-up';  -- 7 days
