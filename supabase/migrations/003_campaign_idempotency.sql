-- Campaign idempotency, reclaimable claims, opt-out, unique message_sid
-- QC r5: STOP backfill uses app-equivalent normalizer; NO business merge-delete.
--
-- Phone collisions after E.164 normalize must be resolved with the separate
-- ABORT-ONLY script: supabase/migrations/003_phone_collision_abort.sql
-- That script lists collisions and raises — it never merges or deletes businesses.
--
-- Rollback: 003_campaign_idempotency_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Ensure suppression table + lead/sms columns
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

-- Optional per-lead IANA timezone (TCPA); when set, quiet-hours uses it.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS timezone TEXT;

ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS reconcile_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS key_supported_at_send BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 1) STOP backfill — same normalizer shape as src/services/opt-out.ts
--    NFKC → trim → strip trailing ?!.,… → collapse whitespace → UPPER
--    Also matches spaceless compact form (S T O P → STOP).
-- ---------------------------------------------------------------------------
INSERT INTO sms_suppressions (business_id, phone, reason)
SELECT DISTINCT ON (l.business_id, l.caller_phone)
  l.business_id,
  l.caller_phone,
  'opt_out_backfill'
FROM sms_messages m
JOIN leads l ON l.id = m.lead_id
WHERE m.direction = 'inbound'
  AND (
    -- Normalized form (app normalizeOptOutText approximation)
    upper(
      btrim(
        regexp_replace(
          regexp_replace(
            normalize(btrim(m.body), NFKC),
            '[?!.,…]+$',
            ''
          ),
          '\s+',
          ' ',
          'g'
        )
      )
    ) IN (
      'STOP', 'STOPALL', 'STOP ALL', 'STOP STOP',
      'UNSUBSCRIBE', 'QUIT', 'END', 'CANCEL',
      'OPTOUT', 'OPT OUT', 'OPT-OUT', 'REVOKE',
      'DON''T TEXT ME AGAIN', 'DONT TEXT ME AGAIN', 'DO NOT TEXT ME AGAIN',
      'PLEASE STOP', 'STOP PLEASE', 'STOP IT',
      'UNSUBSCRIBE ME', 'CANCEL PLEASE', 'LEAVE ME ALONE',
      'STOP TEXTING ME', 'STOP MESSAGING ME',
      'PLEASE STOP TEXTING ME'
    )
    OR
    -- Compact (spaceless) form: 'S T O P', 'STOP STOP'
    replace(
      upper(
        btrim(
          regexp_replace(
            regexp_replace(
              normalize(btrim(m.body), NFKC),
              '[?!.,…]+$',
              ''
            ),
            '\s+',
            ' ',
            'g'
          )
        )
      ),
      ' ',
      ''
    ) IN (
      'STOP', 'STOPALL', 'STOPSTOP', 'UNSUBSCRIBE', 'QUIT', 'END',
      'CANCEL', 'OPTOUT', 'REVOKE'
    )
  )
ON CONFLICT (business_id, phone) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Normalize phones to E.164 (UPDATE only — never merge/delete businesses)
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

-- Abort if normalize created collisions (ops must run abort script / fix data).
-- Does NOT merge or delete businesses.
DO $$
DECLARE
  biz_list TEXT;
  sup_list TEXT;
  biz_n INTEGER;
  sup_n INTEGER;
BEGIN
  SELECT COUNT(*), string_agg(phone || ' (n=' || cnt || ')', ', ')
    INTO biz_n, biz_list
  FROM (
    SELECT phone, COUNT(*)::text AS cnt FROM businesses
    GROUP BY phone HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*), string_agg(business_id::text || '/' || phone, ', ')
    INTO sup_n, sup_list
  FROM (
    SELECT business_id, phone FROM sms_suppressions
    GROUP BY business_id, phone HAVING COUNT(*) > 1
  ) d;

  IF biz_n > 0 OR COALESCE(sup_n, 0) > 0 THEN
    RAISE EXCEPTION
      'Phone collisions after E.164 normalize — refuse to continue. '
      'Business phones: %. Suppression keys: %. '
      'Run 003_phone_collision_abort.sql for the full listing; resolve manually (no auto-merge).',
      COALESCE(biz_list, '(none)'),
      COALESCE(sup_list, '(none)');
  END IF;
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
-- 3) Dedupe enrollments + sms_messages (not businesses)
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

DELETE FROM sms_messages sm
WHERE sm.ctid IN (
  SELECT ctid FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (
             PARTITION BY message_sid
             ORDER BY
               CASE WHEN direction = 'inbound' THEN 0 ELSE 1 END,
               sent_at ASC NULLS LAST,
               id ASC
           ) AS rn
    FROM sms_messages
  ) ranked
  WHERE rn > 1
);

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

-- businesses.phone already UNIQUE in schema.sql; do not merge to satisfy it.

COMMIT;
