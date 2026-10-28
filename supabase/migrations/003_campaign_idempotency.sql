-- Campaign idempotency, reclaimable claims, opt-out, unique message_sid
-- Addresses QC must-fixes for PR #6 follow-up.
--
-- MAINTENANCE NOTE:
-- CREATE UNIQUE INDEX CONCURRENTLY cannot run inside a transaction block.
-- This migration runs in a single transaction with blocking index builds
-- (acceptable for staging / low-traffic). For a busy production cutover,
-- split the UNIQUE INDEX steps into a separate non-transactional migration
-- and use: CREATE UNIQUE INDEX CONCURRENTLY ...
--
-- Rollback: see 003_campaign_idempotency_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Preflight: refuse to proceed if duplicate lead enrollments or message_sids
-- would make UNIQUE indexes fail. Fix data first, then re-run.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dup_leads INTEGER;
  dup_sids INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_leads FROM (
    SELECT lead_id FROM campaign_enrollments
    GROUP BY lead_id HAVING COUNT(*) > 1
  ) d;
  IF dup_leads > 0 THEN
    RAISE EXCEPTION
      'Preflight failed: % lead_id value(s) have multiple campaign_enrollments. Dedupe before applying UNIQUE(lead_id).',
      dup_leads;
  END IF;

  SELECT COUNT(*) INTO dup_sids FROM (
    SELECT message_sid FROM sms_messages
    GROUP BY message_sid HAVING COUNT(*) > 1
  ) d;
  IF dup_sids > 0 THEN
    RAISE EXCEPTION
      'Preflight failed: % duplicate message_sid value(s). Dedupe before applying UNIQUE(message_sid).',
      dup_sids;
  END IF;
END $$;

-- Dedupe safety net (no-ops when preflight already passed with zero dups).
-- Keep the newest enrollment per lead; keep the oldest sms_messages row per sid.
DELETE FROM campaign_enrollments ce
WHERE ce.ctid IN (
  SELECT ctid FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY enrolled_at DESC, created_at DESC) AS rn
    FROM campaign_enrollments
  ) ranked
  WHERE rn > 1
);

DELETE FROM sms_messages sm
WHERE sm.ctid IN (
  SELECT ctid FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (PARTITION BY message_sid ORDER BY sent_at ASC, id ASC) AS rn
    FROM sms_messages
  ) ranked
  WHERE rn > 1
);

-- 1) One enrollment per lead
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_enrollments_lead_id
  ON campaign_enrollments (lead_id);

-- 2) Reclaimable claims + ownership token
ALTER TABLE campaign_enrollments
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

ALTER TABLE campaign_enrollments
  ADD COLUMN IF NOT EXISTS claim_token UUID;

CREATE INDEX IF NOT EXISTS idx_enrollments_claimed_at
  ON campaign_enrollments (claimed_at)
  WHERE status = 'active' AND claimed_at IS NOT NULL;

-- 3) Durable idempotency key for outbound SMS (insert-before-send)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_messages_message_sid
  ON sms_messages (message_sid);

-- 4) Persistent opt-out + phone-level suppression
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

COMMIT;
