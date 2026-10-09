-- Public specialist profiles (2026-10-09). A specialist chooses whether their profile is listed.
-- RLS on with no policies: only the service role (server routes) reads and writes.
create table if not exists public.specialist_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  display_name text not null default '',
  headline text not null default '',
  bio text not null default '',
  skills text[] not null default '{}',
  portfolio jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.specialist_profiles enable row level security;
create index if not exists specialist_profiles_public_idx on public.specialist_profiles (is_public) where is_public;
