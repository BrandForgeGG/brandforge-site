-- Guest chat (chat-first redesign, slice A): conversations owned by an
-- anonymous blueprint session, plus a per-session chat quota.
--
-- WHAT THIS DOES (additive only, nothing existing is altered):
-- * conversations.owner_session_id — a conversation created by a signed-out
--   visitor under the bf_bp HMAC session (blueprint_sessions). user_id stays
--   null until the visitor signs in; the merge in lib/project-db.ts
--   (mergeBlueprintSessionToUser) then adopts the row into the account.
-- * blueprint_sessions.chat_quota_date / chat_quota_count — a durable daily
--   cap on guest AI turns (lib/blueprint-session.js consumeChatQuota), so an
--   anonymous visitor cannot run the model unbounded. Separate from
--   quota_date/quota_count, which cap blueprint runs.
--
-- SAFETY: RLS on conversations is untouched. Guest rows (user_id is null)
-- match no policy for anon or authenticated clients, so they stay invisible
-- to the Supabase API entirely: every guest read/write runs through the
-- service role in lib/project-db.ts after the route has verified the HMAC
-- session owns the conversation (same H7 boundary as 0022).

alter table public.conversations
  add column if not exists owner_session_id uuid references public.blueprint_sessions(id) on delete set null;

create index if not exists conversations_owner_session_idx
  on public.conversations (owner_session_id)
  where owner_session_id is not null;

alter table public.blueprint_sessions
  add column if not exists chat_quota_date date not null default (now() at time zone 'utc')::date;

alter table public.blueprint_sessions
  add column if not exists chat_quota_count integer not null default 0;
