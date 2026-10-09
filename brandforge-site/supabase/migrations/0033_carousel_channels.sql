-- Channels a person links to post carousels to (2026-10-09). Secrets are encrypted by the app; RLS on, no policies.
create table if not exists public.carousel_channels (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, kind text not null check (kind in ('telegram','discord','bluesky')), label text not null default '', secret text, meta jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
alter table public.carousel_channels enable row level security;
create index if not exists carousel_channels_user_idx on public.carousel_channels (user_id);
