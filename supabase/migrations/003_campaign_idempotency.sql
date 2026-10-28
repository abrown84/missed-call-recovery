-- Campaign idempotency, reclaimable claims, opt-out, unique message_sid
-- QC r6: normalize phones BEFORE STOP backfill; collision listing first;
--        suppressions via INSERT…SELECT DISTINCT ON … ON CONFLICT DO NOTHING.
--
-- Phone collisions: supabase/scripts/phone_collision_abort.sql (ABORT-ONLY;
-- never a migration — do not place under migrations/).
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

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS timezone TEXT;

ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS reconcile_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS key_supported_at_send BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 1) Collision listing FIRST on *would-be* E.164 phones (friendly abort
--    reachable before businesses_phone_key fires on UPDATE).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  biz_list TEXT;
  biz_n INTEGER;
BEGIN
  SELECT COUNT(*), string_agg(norm_phone || ' (n=' || cnt || ')', ', ')
    INTO biz_n, biz_list
  FROM (
    SELECT
      CASE
        WHEN phone ~ '^\+1[0-9]{10}$' THEN phone
        WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
          THEN '+1' || regexp_replace(phone, '[^0-9]', '', 'g')
        WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
          THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
        ELSE phone
      END AS norm_phone,
      COUNT(*)::text AS cnt
    FROM businesses
    WHERE phone IS NOT NULL
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) d;

  IF biz_n > 0 THEN
    RAISE EXCEPTION
      'Phone collisions after E.164 normalize — refuse to continue. '
      'Business phones: %. '
      'Run supabase/scripts/phone_collision_abort.sql for the full listing; resolve manually (no auto-merge).',
      COALESCE(biz_list, '(none)');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Normalize phones to E.164 (after collision listing)
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

-- Rebuild suppressions with normalized phones via staging + ON CONFLICT
CREATE TEMP TABLE sms_suppressions_norm AS
SELECT DISTINCT ON (business_id, norm_phone)
  business_id,
  norm_phone AS phone,
  reason,
  created_at
FROM (
  SELECT
    business_id,
    CASE
      WHEN phone ~ '^\+1[0-9]{10}$' THEN phone
      WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
        THEN '+1' || regexp_replace(phone, '[^0-9]', '', 'g')
      WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
        THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
      ELSE phone
    END AS norm_phone,
    reason,
    created_at
  FROM sms_suppressions
) s
ORDER BY business_id, norm_phone, created_at ASC NULLS LAST;

DELETE FROM sms_suppressions;

INSERT INTO sms_suppressions (business_id, phone, reason, created_at)
SELECT business_id, phone, reason, created_at
FROM sms_suppressions_norm
ON CONFLICT (business_id, phone) DO NOTHING;

DROP TABLE sms_suppressions_norm;

-- ---------------------------------------------------------------------------
-- 3) STOP backfill AFTER normalize — whole-message only (shared list with
--    src/services/opt-out-data.ts). NO mid-sentence keyword retro-suppress.
--    Lists: `npm run check:opt-out-sql` / generate-opt-out-sql.mjs.
--    Normalizer mirrors src/services/opt-out.ts normalizeOptOutText + compact.
--    mut.py #25 needles NFKC normalize of m.body in the LATERAL below.
-- ---------------------------------------------------------------------------

-- Post-NFKC finish (ZW / emoji / NBSP / newlines / edge noise / upper).
-- Input should already be NFKC (+ translate). Used by opt_out_normalize_body
-- and by the backfill LATERAL that keeps the mut.py #25 m.body needle.
CREATE OR REPLACE FUNCTION opt_out_finish_normalized(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      s,
                      -- zero-width / soft hyphen / word-joiner / hangul fillers
                      E'[\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u3164\uFFA0]',
                      '',
                      'g'
                    ),
                    -- emoji + misc symbols (covers 🛑 🙂 🙏)
                    E'[\U0001F300-\U0001FAFF\u2600-\u27BF]',
                    '',
                    'g'
                  ),
                  E'\u00A0',
                  ' ',
                  'g'
                ),
                E'[\r\n]+',
                ' ',
                'g'
              ),
              -- edge noise (quotes + punct + space); 3 passes ≈ TS fixpoint.
              -- Use E'\\s' — in escape strings '\s' is a literal s (QC r9 P0).
              E'^[\\s?!.,…''"`“”‘’]+|[\\s?!.,…''"`“”‘’]+$',
              '',
              'g'
            ),
            E'^[\\s?!.,…''"`“”‘’]+|[\\s?!.,…''"`“”‘’]+$',
            '',
            'g'
          ),
          E'^[\\s?!.,…''"`“”‘’]+|[\\s?!.,…''"`“”‘’]+$',
          '',
          'g'
        ),
        E'\\s+',
        ' ',
        'g'
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION opt_out_compact_body(normalized text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(normalized, '[^A-Z0-9]', '', 'g');
$$;

-- Convenience wrapper for tests / ad-hoc.
-- Fold lookalikes AFTER NFKC + upper (QC r9) so math-bold / NFKC outputs fold.
CREATE OR REPLACE FUNCTION opt_out_normalize_body(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- Re-NFKC after upper (inside finish) so case-fold decompositions recompose
  -- before translate — mirrors TS toUpperCase().normalize('NFKC') (QC r9).
  SELECT translate(
    normalize(opt_out_finish_normalized(normalize(btrim(raw), NFKC)), NFKC),
    -- from/to: digit0 + Greek + Cyrillic lookalikes (opt-out-data CONFUSABLES)
    -- Fold runs AFTER upper()+NFKC. Keep lowercase sources so check:opt-out-sql
    -- stays in sync with Object.entries(CONFUSABLES).
    '0ΑΒΕΗΙΚΜΝΟΡΤΧΣοαετАВЕНІӀКМОРСТХЅУаеорстухіѕ',
    'OABEHIKMNOPTXEOAETABEHIIKMOPCTXSUAEOPCTUXIS'
  );
$$;

INSERT INTO sms_suppressions (business_id, phone, reason)
SELECT DISTINCT ON (l.business_id, l.caller_phone)
  l.business_id,
  l.caller_phone,
  'opt_out_backfill'
FROM sms_messages m
JOIN leads l ON l.id = m.lead_id
-- Single NFKC site so mut.py #25 (occurrence 1) breaks both exact + compact arms.
CROSS JOIN LATERAL (
  SELECT translate(
    normalize(opt_out_finish_normalized(normalize(btrim(m.body), NFKC)), NFKC),
    '0ΑΒΕΗΙΚΜΝΟΡΤΧΣοαετАВЕНІӀКМОРСТХЅУаеорстухіѕ',
    'OABEHIKMNOPTXEOAETABEHIIKMOPCTXSUAEOPCTUXIS'
  ) AS norm
) n
WHERE m.direction = 'inbound'
  AND (
    n.norm IN (
      'STOP', 'STOPALL', 'STOP ALL', 'UNSUBSCRIBE', 'QUIT', 'END', 'CANCEL',
      'OPTOUT', 'OPT OUT', 'OPT-OUT', 'REVOKE',
      'DON''T TEXT ME AGAIN', 'DONT TEXT ME AGAIN', 'DO NOT TEXT ME AGAIN',
      'DO NOT CONTACT ME', 'DONT CONTACT ME', 'DON''T CONTACT ME',
      'PLEASE STOP', 'STOP PLEASE', 'STOP IT', 'STOP PLS',
      'STOP TEXTING', 'STOP TEXTING ME', 'STOP MESSAGING ME', 'STOP SENDING',
      'STOP ALL TEXTS', 'PLEASE STOP TEXTING ME',
      'UNSUBSCRIBE ME', 'UNSUBSCRIBE ME PLEASE', 'PLEASE UNSUBSCRIBE ME',
      'CANCEL PLEASE',
      'LEAVE ME ALONE', 'TAKE ME OFF YOUR LIST', 'TAKE ME OFF THE LIST',
      'DONT TEXT ME', 'DON''T TEXT ME',
      'STOP STOP', 'STOP STOP STOP',
      'END END', 'END END END',
      'CANCEL CANCEL', 'CANCEL CANCEL CANCEL',
      'QUIT QUIT', 'QUIT QUIT QUIT',
      'UNSUBSCRIBE UNSUBSCRIBE', 'UNSUBSCRIBE UNSUBSCRIBE UNSUBSCRIBE',
      'REVOKE REVOKE', 'REVOKE REVOKE REVOKE',
      'OPTOUT OPTOUT', 'OPTOUT OPTOUT OPTOUT',
      'STOPALL STOPALL', 'STOPALL STOPALL STOPALL'
    )
    OR
    opt_out_compact_body(n.norm) IN (
      'STOP', 'STOPALL', 'UNSUBSCRIBE', 'QUIT', 'END', 'CANCEL', 'OPTOUT', 'REVOKE',
      'DONTTEXTMEAGAIN', 'DONOTTEXTMEAGAIN', 'DONOTCONTACTME', 'DONTCONTACTME',
      'PLEASESTOP', 'STOPPLEASE', 'STOPIT', 'STOPPLS',
      'STOPTEXTING', 'STOPTEXTINGME', 'STOPMESSAGINGME', 'STOPSENDING',
      'STOPALLTEXTS', 'PLEASESTOPTEXTINGME',
      'UNSUBSCRIBEME', 'UNSUBSCRIBEMEPLEASE', 'PLEASEUNSUBSCRIBEME',
      'CANCELPLEASE', 'LEAVEMEALONE', 'TAKEMEOFFYOURLIST', 'TAKEMEOFFTHELIST',
      'DONTTEXTME',
      'STOPSTOP', 'STOPSTOPSTOP',
      'ENDEND', 'ENDENDEND',
      'CANCELCANCEL', 'CANCELCANCELCANCEL',
      'QUITQUIT', 'QUITQUITQUIT',
      'UNSUBSCRIBEUNSUBSCRIBE', 'UNSUBSCRIBEUNSUBSCRIBEUNSUBSCRIBE',
      'REVOKEREVOKE', 'REVOKEREVOKEREVOKE',
      'OPTOUTOPTOUT', 'OPTOUTOPTOUTOPTOUT',
      'STOPALLSTOPALL', 'STOPALLSTOPALLSTOPALL'
    )
  )
ON CONFLICT (business_id, phone) DO NOTHING;

-- Mark leads opted_out from suppressions (phones already normalized)
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
-- 4) Dedupe enrollments + sms_messages (not businesses)
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
-- 5) Indexes / claim columns
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

CREATE INDEX IF NOT EXISTS idx_sms_messages_next_retry
  ON sms_messages (next_retry_at)
  WHERE status IN ('unknown', 'deferred') AND next_retry_at IS NOT NULL;

COMMIT;
