-- 0013: contract signature + terms revision tracking on agreements.
--
-- The chat contract card lets BOTH sides read, edit the terms, and accept — the accept
-- timestamps ARE the signature. Any terms edit clears both accepts (the signed text must
-- be what both sides last saw), so signature state always lives next to the text it covers.
--
-- Applied by hand (no service-role SQL from the app). Routes write these columns through
-- the service-role client; the founder-facing read path is the plain SELECT policy.

ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS founder_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS team_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_updated_by UUID;

COMMENT ON COLUMN agreements.founder_accepted_at IS
  'Signature: when the project owner accepted the current terms. Cleared by any terms edit.';
COMMENT ON COLUMN agreements.team_accepted_at IS
  'Signature: when BrandForge staff accepted the current terms. Cleared by any terms edit.';
COMMENT ON COLUMN agreements.terms_updated_at IS 'When the contract text was last revised.';
COMMENT ON COLUMN agreements.terms_updated_by IS 'Profile id of the last terms editor.';
