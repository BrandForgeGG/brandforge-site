-- Published posts and time on site (2026-10-14).
-- published_posts: every post BrandForge sends to a social network that came back with a public link, so Distribute can
-- show what members are actually publishing. Only the link, the network and a short caption are kept.
create table if not exists public.published_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null,
  url text not null,
  caption text not null default '',
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.published_posts enable row level security;
create index if not exists published_posts_feed_idx on public.published_posts (created_at desc) where hidden = false;

-- usage_days: time spent on the site, per visitor per day, counted from a heartbeat sent once a minute while a tab is open
-- and visible, and only for visitors who accepted measurement. visitor_id is the random first-party id; user_id is set when
-- the visitor is signed in.
create table if not exists public.usage_days (
  visitor_id text not null,
  day date not null default (now() at time zone 'utc')::date,
  user_id uuid references auth.users(id) on delete set null,
  seconds integer not null default 0,
  last_seen timestamptz not null default now(),
  primary key (visitor_id, day)
);
alter table public.usage_days enable row level security;
create index if not exists usage_days_last_seen_idx on public.usage_days (last_seen desc);
create index if not exists usage_days_user_idx on public.usage_days (user_id) where user_id is not null;

-- One heartbeat: adds the time since the last beat (at most 75 seconds, so a tab left in the background is not counted
-- as hours of use), and remembers who is signed in.
create or replace function public.usage_beat(p_visitor text, p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.usage_days as u (visitor_id, day, user_id, seconds, last_seen)
  values (p_visitor, (now() at time zone 'utc')::date, p_user, 0, now())
  on conflict (visitor_id, day) do update
    set seconds = u.seconds + least(75, greatest(0, extract(epoch from (now() - u.last_seen))::int)),
        last_seen = now(),
        user_id = coalesce(excluded.user_id, u.user_id);
$$;
revoke all on function public.usage_beat(text, uuid) from public, anon, authenticated;

-- The numbers Explore shows, in one call.
create or replace function public.usage_summary(p_user uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'registered', (select count(*) from public.profiles),
    'online', (select count(distinct visitor_id) from public.usage_days where last_seen > now() - interval '2 minutes'),
    'total_seconds', (select coalesce(sum(seconds), 0) from public.usage_days),
    'member_seconds', (select coalesce(sum(seconds), 0) from public.usage_days where user_id is not null),
    'members_counted', (select count(distinct user_id) from public.usage_days where user_id is not null),
    'since', (select min(day) from public.usage_days),
    'mine', case when p_user is null then null else (select coalesce(sum(seconds), 0) from public.usage_days where user_id = p_user) end
  );
$$;
revoke all on function public.usage_summary(uuid) from public, anon, authenticated;
