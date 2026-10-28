-- Harden RLS: remove open USING (true) policies that effectively disabled RLS
-- for anyone holding the anon key.
--
-- API routes use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- After this migration, the anon/authenticated JWT keys cannot read/write tables
-- directly from the browser — all data access must go through authenticated API routes.

DROP POLICY IF EXISTS "Service role full access" ON businesses;
DROP POLICY IF EXISTS "Service role full access" ON missed_calls;
DROP POLICY IF EXISTS "Service role full access" ON leads;
DROP POLICY IF EXISTS "Service role full access" ON sms_messages;
DROP POLICY IF EXISTS "Service role full access" ON campaigns;
DROP POLICY IF EXISTS "Service role full access" ON campaign_steps;
DROP POLICY IF EXISTS "Service role full access" ON campaign_enrollments;

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE missed_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_enrollments ENABLE ROW LEVEL SECURITY;
