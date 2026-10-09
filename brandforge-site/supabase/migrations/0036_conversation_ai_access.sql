-- Who may make the AI generate in a shared chat (2026-10-10). The chat owner always can; everyone else asks,
-- and the owner allows or declines. RLS on with no policies: only the server (service role) reads and writes.
create table if not exists public.conversation_ai_access (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','granted','denied')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (conversation_id, user_id)
);
alter table public.conversation_ai_access enable row level security;
create index if not exists conversation_ai_access_conv_idx on public.conversation_ai_access (conversation_id, status);
