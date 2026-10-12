-- Scheduled posts (2026-10-12): Distribute posts at the time it planned them, to the channels a person linked.
-- The pictures are kept in the public "creations" bucket under scheduled/<user>/<post>/ until they are sent.
-- Only the server reads or writes this table (RLS on, no policies).
alter table public.carousel_channels drop constraint if exists carousel_channels_kind_check;
alter table public.carousel_channels add constraint carousel_channels_kind_check check (kind in ('telegram','discord','bluesky','slack','tumblr','mastodon'));

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_ids jsonb not null default '[]'::jsonb,
  caption text not null default '',
  image_paths jsonb not null default '[]'::jsonb,
  label text not null default '',
  run_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','posting','done','partial','failed','cancelled')),
  results jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
alter table public.scheduled_posts enable row level security;
create index if not exists scheduled_posts_due_idx on public.scheduled_posts (run_at) where status = 'scheduled';
create index if not exists scheduled_posts_user_idx on public.scheduled_posts (user_id, run_at);
