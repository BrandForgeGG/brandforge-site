-- Saved carousels (2026-10-09). RLS on with no policies: only the server (service role) reads and writes.
create table if not exists public.carousels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  type text not null default 'list',
  theme text not null default 'forge',
  plan jsonb not null,
  brand jsonb not null default '{}'::jsonb,
  captions jsonb not null default '{}'::jsonb,
  planned_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.carousels enable row level security;
create index if not exists carousels_user_updated_idx on public.carousels (user_id, updated_at desc);
