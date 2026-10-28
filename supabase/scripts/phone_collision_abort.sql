-- ABORT-ONLY phone collision report (QC r5).
--
-- Run BEFORE or instead of hand-fixing data when E.164 normalize would
-- collide on businesses.phone or sms_suppressions (business_id, phone).
--
-- THIS SCRIPT NEVER MERGES OR DELETES BUSINESSES OR SUPPRESSIONS.
-- It only lists collisions and RAISE EXCEPTION (transaction aborts).
--
-- Usage (psql / SQL editor):
--   BEGIN;
--   \i 003_phone_collision_abort.sql
--   -- always aborts if any collision; otherwise completes with NOTICE

DO $$
DECLARE
  r RECORD;
  biz_lines TEXT := '';
  sup_lines TEXT := '';
  biz_n INTEGER := 0;
  sup_n INTEGER := 0;
  norm TEXT;
BEGIN
  -- Preview normalize for businesses
  FOR r IN
    SELECT id, phone,
      CASE
        WHEN phone ~ '^\+1[0-9]{10}$' THEN phone
        WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
          THEN '+1' || regexp_replace(phone, '[^0-9]', '', 'g')
        WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
          THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
        ELSE phone
      END AS e164
    FROM businesses
  LOOP
    NULL; -- iteration only to keep planner honest; aggregation below
  END LOOP;

  SELECT COUNT(*), string_agg(
      format('%s ← ids %s', e164, ids),
      E'\n'
    )
  INTO biz_n, biz_lines
  FROM (
    SELECT e164, string_agg(id::text, ', ' ORDER BY id) AS ids
    FROM (
      SELECT id,
        CASE
          WHEN phone ~ '^\+1[0-9]{10}$' THEN phone
          WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
            THEN '+1' || regexp_replace(phone, '[^0-9]', '', 'g')
          WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
            THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
          ELSE phone
        END AS e164
      FROM businesses
    ) n
    GROUP BY e164
    HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*), string_agg(
      format('business=%s phone=%s (n=%s)', business_id, e164, cnt),
      E'\n'
    )
  INTO sup_n, sup_lines
  FROM (
    SELECT business_id, e164, COUNT(*)::text AS cnt
    FROM (
      SELECT business_id,
        CASE
          WHEN phone ~ '^\+1[0-9]{10}$' THEN phone
          WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
            THEN '+1' || regexp_replace(phone, '[^0-9]', '', 'g')
          WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
            THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
          ELSE phone
        END AS e164
      FROM sms_suppressions
    ) n
    GROUP BY business_id, e164
    HAVING COUNT(*) > 1
  ) d;

  IF COALESCE(biz_n, 0) = 0 AND COALESCE(sup_n, 0) = 0 THEN
    RAISE NOTICE 'No phone collisions after E.164 normalize.';
    RETURN;
  END IF;

  RAISE EXCEPTION
    E'ABORT: phone collisions after E.164 normalize (no auto-merge).\n'
    'Business phone collisions (%):\n%\n'
    'Suppression collisions (%):\n%',
    COALESCE(biz_n, 0),
    COALESCE(biz_lines, '(none)'),
    COALESCE(sup_n, 0),
    COALESCE(sup_lines, '(none)');
END $$;
