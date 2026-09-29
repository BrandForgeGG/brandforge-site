-- Marketing autoposter queue (P5). PROPOSED — awaiting founder "go". NOT applied.
--
-- WHAT THIS DOES: a single queue table for scheduled outbound posts across
-- Discord, Telegram and Reddit. A processor (separate commit, after go) reads due
-- rows, publishes them, and writes back status + permalink + error. The table
-- itself is the audit log: every attempt is recorded, nothing is fire-and-forget.
--
-- SAFETY BY DESIGN:
-- - RLS is enabled with no policies: anon/authenticated clients are denied everything
--   by default; only the service role touches this table. This answers the editor's
--   RLS warning in code, not via the dialog button.
-- - No auto-approval bypass is possible from schema alone: the processor will
--   refuse to run unless MARKETING_ENABLED=true (global kill switch, default off).
-- - Per-channel flags (MARKETING_DISCORD / MARKETING_TELEGRAM / MARKETING_REDDIT)
--   gate each destination independently.
-- - No secrets live here: webhook URLs, bot tokens and Reddit OAuth credentials
--   stay in Vercel env vars. Targets name channels, never credentials.
-- - Additive only. No RLS change in this migration (service-role writes from the
--   processor; reads for the audit view come later with the processor commit).
--
-- STATUS: PROPOSED — awaiting founder "go". NOT applied.

create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Destination. 'discord' posts via webhook embeds, 'telegram' via the bot API,
  -- 'reddit' via the official API with a script-type OAuth app (single account).
  channel text not null check (channel in ('discord', 'telegram', 'reddit')),

  -- Where exactly: Discord webhook kind (briefs/proposals/live/devlog) or full
  -- channel name for manual routing, Telegram channel id/handle, subreddit name
  -- (without the r/ prefix). Never a secret.
  target text not null,

  title text,
  body text not null,
  url text,

  scheduled_at timestamptz not null,

  -- Lifecycle: queued -> posted | failed. 'paused' freezes a row (auto-pause on
  -- removals, bans or rate-limit errors). Retries requeue with attempts + 1.
  status text not null default 'queued'
    check (status in ('queued', 'posted', 'failed', 'paused')),
  attempts integer not null default 0,
  posted_at timestamptz,
  permalink text,
  error text
);

create index if not exists marketing_posts_due_idx
  on public.marketing_posts (status, scheduled_at);

-- Locked down by default: RLS enabled with NO policies, so anon/authenticated
-- clients are denied everything and only the service role (processor, admin reads)
-- touches this table. The Supabase editor warning is answered by these lines, not
-- by the dialog button — keep the file as the source of truth.
alter table public.marketing_posts enable row level security;

comment on table public.marketing_posts is
  'Scheduled outbound marketing queue (P5). Audit log included: every attempt writes status, permalink or error.';
