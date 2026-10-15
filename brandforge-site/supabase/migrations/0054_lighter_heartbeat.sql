-- Lighter heartbeat (2026-10-15): to stay inside the free hosting plan, an open tab reports once every five minutes instead
-- of every minute. Each beat may now count up to five and a half minutes, and "online now" means seen in the last six.
create or replace function public.usage_beat(p_visitor text, p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.usage_days as u (visitor_id, day, user_id, seconds, last_seen)
  values (p_visitor, (now() at time zone 'utc')::date, p_user, 0, now())
  on conflict (visitor_id, day) do update
    set seconds = u.seconds + least(330, greatest(0, extract(epoch from (now() - u.last_seen))::int)),
        last_seen = now(),
        user_id = coalesce(excluded.user_id, u.user_id);
$$;
revoke all on function public.usage_beat(text, uuid) from public, anon, authenticated;

create or replace function public.usage_summary(p_user uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'registered', (select count(*) from public.profiles),
    'online', (select count(distinct visitor_id) from public.usage_days where last_seen > now() - interval '6 minutes'),
    'total_seconds', (select coalesce(sum(seconds), 0) from public.usage_days),
    'member_seconds', (select coalesce(sum(seconds), 0) from public.usage_days where user_id is not null),
    'members_counted', (select count(distinct user_id) from public.usage_days where user_id is not null),
    'since', (select min(day) from public.usage_days),
    'mine', case when p_user is null then null else (select coalesce(sum(seconds), 0) from public.usage_days where user_id = p_user) end
  );
$$;
revoke all on function public.usage_summary(uuid) from public, anon, authenticated;
