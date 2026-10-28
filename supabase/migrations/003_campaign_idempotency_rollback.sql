-- Rollback for 003_campaign_idempotency.sql
-- Run manually if you need to undo the migration on a staging DB.
--
-- CRITICAL: sms_suppressions is ARCHIVED, not dropped. TCPA opt-out history
-- must survive rollback so we never re-text a suppressed number.

BEGIN;

DROP INDEX IF EXISTS uq_campaign_enrollments_lead_id;
DROP INDEX IF EXISTS idx_enrollments_claimed_at;
DROP INDEX IF EXISTS uq_sms_messages_message_sid;
DROP INDEX IF EXISTS idx_sms_suppressions_phone;

ALTER TABLE campaign_enrollments DROP COLUMN IF EXISTS claimed_at;
ALTER TABLE campaign_enrollments DROP COLUMN IF EXISTS claim_token;

ALTER TABLE leads DROP COLUMN IF EXISTS opted_out;
ALTER TABLE leads DROP COLUMN IF EXISTS opted_out_at;

-- Archive suppressions instead of DROP TABLE.
-- Re-running forward migration can recreate sms_suppressions empty; restore
-- from sms_suppressions_archive_003 if needed.
CREATE TABLE IF NOT EXISTS sms_suppressions_archive_003 (
  LIKE sms_suppressions INCLUDING ALL
);

INSERT INTO sms_suppressions_archive_003
SELECT * FROM sms_suppressions
ON CONFLICT DO NOTHING;

-- Intentionally keep sms_suppressions (and the archive table). Never drop
-- opt-out history on rollback.

COMMIT;
