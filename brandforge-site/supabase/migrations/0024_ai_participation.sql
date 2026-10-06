-- AI participation control: per-conversation AI on/off toggle.
-- When disabled, the AI does not automatically reply or interrupt conversations.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN conversations.ai_enabled IS 'When false, BrandForge AI does not automatically reply or update project context.';
