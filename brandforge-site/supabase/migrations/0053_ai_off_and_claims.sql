-- AI off by default, and claimed chats (2026-10-15).
-- 1. New chats start with the AI off: a plain message goes to the team (the AI is one tap away, and actions still use it).
--    Chats that exist keep whatever they had.
-- 2. A chat can be claimed by one team member, like a ticket: they talk in it; other team members talk only once the
--    claimer adds them (admins can always step in). Unclaimed chats ping the whole team.
alter table public.conversations alter column ai_enabled set default false;
alter table public.conversations add column if not exists claimed_by uuid references auth.users(id) on delete set null;
alter table public.conversations add column if not exists claimed_at timestamptz;
create index if not exists conversations_claimed_by_idx on public.conversations (claimed_by) where claimed_by is not null;
