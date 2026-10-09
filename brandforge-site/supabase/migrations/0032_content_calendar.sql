-- Weekly content calendar (2026-10-09): RLS on, no policies, server only.
create table if not exists public.content_calendar_prefs (weekday smallint primary key check (weekday between 0 and 6), slots jsonb not null default '[]'::jsonb, updated_at timestamptz not null default now());
create table if not exists public.content_calendar_settings (id smallint primary key default 1 check (id = 1), auto_post boolean not null default false, updated_at timestamptz not null default now());
insert into public.content_calendar_settings (id, auto_post) values (1, false) on conflict (id) do nothing;
create table if not exists public.content_calendar_posts (id uuid primary key default gen_random_uuid(), post_date date not null, slot smallint not null check (slot between 0 and 4), scheduled_at timestamptz not null, type text not null, topic text not null default '', theme text not null default 'forge', status text not null default 'planned' check (status in ('planned','ready','approved','posting','posted','failed','skipped')), plan jsonb, caption text not null default '', results jsonb not null default '{}'::jsonb, attempts smallint not null default 0, error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (post_date, slot));
create index if not exists content_calendar_posts_due_idx on public.content_calendar_posts (status, scheduled_at);
alter table public.content_calendar_prefs enable row level security;
alter table public.content_calendar_settings enable row level security;
alter table public.content_calendar_posts enable row level security;
