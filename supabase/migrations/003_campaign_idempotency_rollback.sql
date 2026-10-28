-- Rollback for 003_campaign_idempotency.sql
-- Run manually if you need to undo the migration on a staging DB.
-- WARNING: drops suppression data and claim columns.

BEGIN;

DROP INDEX IF EXISTS uq_campaign_enrollments_lead_id;
DROP INDEX IF EXISTS idx_enrollments_claimed_at;
DROP INDEX IF EXISTS uq_sms_messages_message_sid;
DROP INDEX IF EXISTS idx_sms_suppressions_phone;

ALTER TABLE campaign_enrollments DROP COLUMN IF EXISTS claimed_at;
ALTER TABLE campaign_enrollments DROP COLUMN IF EXISTS claim_token;

ALTER TABLE leads DROP COLUMN IF EXISTS opted_out;
ALTER TABLE leads DROP COLUMN IF EXISTS opted_out_at;

DROP TABLE IF EXISTS sms_suppressions;

COMMIT;
