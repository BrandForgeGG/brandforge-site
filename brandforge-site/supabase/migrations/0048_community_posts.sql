-- Community posts (2026-10-13): what people chose to share from Create and Distribute, shown to everyone on those pages.
-- Only what a person shares with the "Share to the community" button lands here; nothing private is ever copied in.
-- Pictures live in the public "creations" bucket under community/<user>/<post>/. Only the server reads or writes this table.
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('create','distribute')),
  format text not null default '',
  title text not null default '',
  caption text not null default '',
  image_urls jsonb not null default '[]'::jsonb,
  image_paths jsonb not null default '[]'::jsonb,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.community_posts enable row level security;
create index if not exists community_posts_feed_idx on public.community_posts (kind, created_at desc) where hidden = false;
create index if not exists community_posts_user_idx on public.community_posts (user_id, created_at desc);
