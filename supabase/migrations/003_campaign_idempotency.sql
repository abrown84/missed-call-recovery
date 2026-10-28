-- Campaign idempotency, reclaimable claims, opt-out, unique message_sid
-- Addresses QC must-fixes for PR #6 follow-up (r3).
--
-- MAINTENANCE NOTE:
-- CREATE UNIQUE INDEX CONCURRENTLY cannot run inside a transaction block.
-- This migration runs in a single transaction with blocking index builds
-- (acceptable for staging / low-traffic). For a busy production cutover,
-- split the UNIQUE INDEX steps into a separate non-transactional migration
-- and use: CREATE UNIQUE INDEX CONCURRENTLY ...
--
-- Rollback: see 003_campaign_idempotency_rollback.sql
--   (archives sms_suppressions — does NOT drop suppression data)

BEGIN;

-- ---------------------------------------------------------------------------
-- Dedupe BEFORE preflight so UNIQUE indexes can be applied cleanly.
-- Keep the newest enrollment per lead; keep the oldest sms_messages row per sid.
-- ---------------------------------------------------------------------------
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

-- Preflight: refuse if duplicates remain after dedupe (should be zero).
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
      'Preflight failed: % lead_id value(s) still have multiple campaign_enrollments after dedupe.',
      dup_leads;
  END IF;

  SELECT COUNT(*) INTO dup_sids FROM (
    SELECT message_sid FROM sms_messages
    GROUP BY message_sid HAVING COUNT(*) > 1
  ) d;
  IF dup_sids > 0 THEN
    RAISE EXCEPTION
      'Preflight failed: % duplicate message_sid value(s) remain after dedupe.',
      dup_sids;
  END IF;
END $$;

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

-- 5) Backfill suppressions from historical STOP / opt-out inbound SMS
--    (whole-message style keywords; case-insensitive; NFKC-ish via trim/upper).
INSERT INTO sms_suppressions (business_id, phone, reason)
SELECT DISTINCT ON (l.business_id, l.caller_phone)
  l.business_id,
  l.caller_phone,
  'opt_out_backfill'
FROM sms_messages m
JOIN leads l ON l.id = m.lead_id
WHERE m.direction = 'inbound'
  AND upper(btrim(m.body)) IN (
    'STOP', 'STOPALL', 'STOP ALL', 'UNSUBSCRIBE', 'QUIT', 'END', 'CANCEL',
    'OPTOUT', 'OPT OUT', 'OPT-OUT', 'REVOKE',
    'DON''T TEXT ME AGAIN', 'DONT TEXT ME AGAIN', 'DO NOT TEXT ME AGAIN',
    'PLEASE STOP', 'STOP PLEASE'
  )
ON CONFLICT (business_id, phone) DO NOTHING;

UPDATE leads l
SET
  opted_out = true,
  opted_out_at = COALESCE(l.opted_out_at, NOW())
WHERE EXISTS (
  SELECT 1 FROM sms_suppressions s
  WHERE s.business_id = l.business_id
    AND s.phone = l.caller_phone
    AND s.reason IN ('opt_out', 'opt_out_backfill')
)
AND l.opted_out IS DISTINCT FROM true;

-- 6) Convert existing caller_phone / business phone values toward E.164 (US NANP).
--    Strips non-digits; 10-digit → +1XXXXXXXXXX; 11-digit leading 1 → +1…;
--    already-+ values left alone when they look like +1 + 10 digits.
--    Leaves unconvertible values unchanged for manual review.
UPDATE leads
SET caller_phone = CASE
  WHEN caller_phone ~ '^\+1[0-9]{10}$' THEN caller_phone
  WHEN regexp_replace(caller_phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
    THEN '+1' || regexp_replace(caller_phone, '[^0-9]', '', 'g')
  WHEN regexp_replace(caller_phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
    THEN '+' || regexp_replace(caller_phone, '[^0-9]', '', 'g')
  ELSE caller_phone
END
WHERE caller_phone IS NOT NULL
  AND caller_phone !~ '^\+1[0-9]{10}$';

UPDATE businesses
SET phone = CASE
  WHEN phone ~ '^\+1[0-9]{10}$' THEN phone
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
    THEN '+1' || regexp_replace(phone, '[^0-9]', '', 'g')
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
    THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
  ELSE phone
END
WHERE phone IS NOT NULL
  AND phone !~ '^\+1[0-9]{10}$';

UPDATE sms_suppressions
SET phone = CASE
  WHEN phone ~ '^\+1[0-9]{10}$' THEN phone
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
    THEN '+1' || regexp_replace(phone, '[^0-9]', '', 'g')
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
    THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
  ELSE phone
END
WHERE phone IS NOT NULL
  AND phone !~ '^\+1[0-9]{10}$';

COMMIT;
