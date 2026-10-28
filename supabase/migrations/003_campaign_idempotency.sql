-- Campaign idempotency, reclaimable claims, opt-out, unique message_sid
-- Addresses QC must-fixes for PR #6 follow-up.

-- 1) One enrollment per lead (blocks re-enroll ping-pong / check-then-insert races)
-- Keep the old (lead_id, campaign_id) unique as a no-op once lead_id is unique.
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_enrollments_lead_id
  ON campaign_enrollments (lead_id);

-- 2) Reclaimable claims: crash/timeout between claim and advance no longer strands forever
ALTER TABLE campaign_enrollments
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_enrollments_claimed_at
  ON campaign_enrollments (claimed_at)
  WHERE status = 'active' AND claimed_at IS NOT NULL;

-- 3) Durable idempotency key for outbound SMS (insert-before-send)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_messages_message_sid
  ON sms_messages (message_sid);

-- 4) Persistent opt-out on the lead + phone-level suppression list
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS sms_suppressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_sms_suppressions_phone
  ON sms_suppressions (phone);

ALTER TABLE sms_suppressions ENABLE ROW LEVEL SECURITY;
