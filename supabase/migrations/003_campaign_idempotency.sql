-- Campaign idempotency, reclaimable claims, opt-out, unique message_sid
-- QC r3 + r4: STOP-safe backfill, E.164 merge, reconcile attempts, human review.
--
-- MAINTENANCE NOTE:
-- CREATE UNIQUE INDEX CONCURRENTLY cannot run inside a transaction block.
-- This migration runs in a single transaction with blocking index builds.
-- Rollback: see 003_campaign_idempotency_rollback.sql
--   (archives sms_suppressions — does NOT drop suppression data)

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Ensure suppression table exists BEFORE backfill / phone normalize
-- ---------------------------------------------------------------------------
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

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS needs_human_review BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS needs_human_review_at TIMESTAMPTZ;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS needs_human_review_reason TEXT;

-- Reconcile attempt tracking on sms_messages
ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS reconcile_attempts INTEGER NOT NULL DEFAULT 0;

-- True only when BOTH were true for this send (relay >= 1.7.6):
--   1) GET /api/capabilities returned idempotency:true *before* the send
--   2) the send response echoed idempotencyKey
-- Pre-upgrade / rollback rows stay false → found:false goes to needs_review.
ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS key_supported_at_send BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 1) BACKFILL suppressions from STOP inbound FIRST (before any sms dedupe)
--    Uses app-equivalent whole-message tokens (upper + btrim).
-- ---------------------------------------------------------------------------
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
    'PLEASE STOP', 'STOP PLEASE', 'STOP IT', 'UNSUBSCRIBE ME', 'CANCEL PLEASE',
    'LEAVE ME ALONE', 'STOP TEXTING ME', 'STOP MESSAGING ME',
    'STOP?', '"STOP"', '''STOP'''
  )
ON CONFLICT (business_id, phone) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Normalize phones to E.164 BEFORE unique indexes / merges
-- ---------------------------------------------------------------------------
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

-- Merge duplicate suppressions that collide after E.164 normalize
DELETE FROM sms_suppressions s
WHERE s.ctid IN (
  SELECT ctid FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (
             PARTITION BY business_id, phone
             ORDER BY created_at ASC NULLS LAST, id ASC
           ) AS rn
    FROM sms_suppressions
  ) ranked
  WHERE rn > 1
);

-- Merge duplicate businesses that collide on phone after normalize:
-- keep the oldest, re-point children, then delete extras.
DO $$
DECLARE
  r RECORD;
  keeper UUID;
BEGIN
  FOR r IN
    SELECT phone FROM businesses
    GROUP BY phone HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper FROM businesses
    WHERE phone = r.phone
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1;

    UPDATE leads SET business_id = keeper
    WHERE business_id IN (SELECT id FROM businesses WHERE phone = r.phone AND id <> keeper);

    UPDATE missed_calls SET business_id = keeper
    WHERE business_id IN (SELECT id FROM businesses WHERE phone = r.phone AND id <> keeper);

    UPDATE sms_suppressions SET business_id = keeper
    WHERE business_id IN (SELECT id FROM businesses WHERE phone = r.phone AND id <> keeper)
      AND NOT EXISTS (
        SELECT 1 FROM sms_suppressions x
        WHERE x.business_id = keeper AND x.phone = sms_suppressions.phone
      );

    DELETE FROM sms_suppressions
    WHERE business_id IN (SELECT id FROM businesses WHERE phone = r.phone AND id <> keeper);

    DELETE FROM businesses WHERE phone = r.phone AND id <> keeper;
  END LOOP;
END $$;

-- Mark leads opted_out from suppressions (after phone normalize)
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

-- ---------------------------------------------------------------------------
-- 3) Dedupe enrollments: prefer active; NULL enrolled_at/created_at sort LAST
-- ---------------------------------------------------------------------------
DELETE FROM campaign_enrollments ce
WHERE ce.ctid IN (
  SELECT ctid FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (
             PARTITION BY lead_id
             ORDER BY
               CASE WHEN status = 'active' THEN 0 ELSE 1 END,
               enrolled_at DESC NULLS LAST,
               created_at DESC NULLS LAST
           ) AS rn
    FROM campaign_enrollments
  ) ranked
  WHERE rn > 1
);

-- Dedupe sms_messages by sid: prefer keeping inbound STOP bodies, then oldest
DELETE FROM sms_messages sm
WHERE sm.ctid IN (
  SELECT ctid FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (
             PARTITION BY message_sid
             ORDER BY
               CASE
                 WHEN direction = 'inbound'
                  AND upper(btrim(body)) IN (
                    'STOP','STOPALL','STOP ALL','UNSUBSCRIBE','QUIT','END','CANCEL',
                    'OPTOUT','OPT OUT','OPT-OUT','REVOKE','PLEASE STOP','STOP PLEASE',
                    'STOP IT','UNSUBSCRIBE ME','CANCEL PLEASE','LEAVE ME ALONE'
                  ) THEN 0
                 ELSE 1
               END,
               sent_at ASC NULLS LAST,
               id ASC
           ) AS rn
    FROM sms_messages
  ) ranked
  WHERE rn > 1
);

-- Preflight: refuse if duplicates remain
DO $$
DECLARE
  dup_leads INTEGER;
  dup_sids INTEGER;
  dup_biz INTEGER;
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

  SELECT COUNT(*) INTO dup_biz FROM (
    SELECT phone FROM businesses GROUP BY phone HAVING COUNT(*) > 1
  ) d;
  IF dup_biz > 0 THEN
    RAISE EXCEPTION
      'Preflight failed: % duplicate business phone(s) remain after merge.',
      dup_biz;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Indexes / claim columns
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_enrollments_lead_id
  ON campaign_enrollments (lead_id);

ALTER TABLE campaign_enrollments
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

ALTER TABLE campaign_enrollments
  ADD COLUMN IF NOT EXISTS claim_token UUID;

CREATE INDEX IF NOT EXISTS idx_enrollments_claimed_at
  ON campaign_enrollments (claimed_at)
  WHERE status = 'active' AND claimed_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_messages_message_sid
  ON sms_messages (message_sid);

CREATE UNIQUE INDEX IF NOT EXISTS uq_businesses_phone
  ON businesses (phone);

COMMIT;
