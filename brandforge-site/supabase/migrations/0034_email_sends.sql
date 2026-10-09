-- Which sequence email each person has already been sent (2026-10-09). One row per person and kind:
-- the unique key is what guarantees a step can never go out twice, even if the scheduler runs twice.
-- RLS on with no policies: only the server (service role) reads and writes.
create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind)
);
alter table public.email_sends enable row level security;
create index if not exists email_sends_user_idx on public.email_sends (user_id, sent_at desc);
