-- Free plan allowances: how many AI creations and videos each person (or, signed out, each address) made this month.
-- Written and read only by the server (service role): RLS on, no policies.
create table if not exists public.usage_monthly (
  key text not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  kind text not null check (kind in ('creation', 'video')),
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (key, month, kind)
);

alter table public.usage_monthly enable row level security;

-- One atomic +1, returning the new count.
create or replace function public.bump_usage(p_key text, p_month text, p_kind text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.usage_monthly (key, month, kind, count)
  values (p_key, p_month, p_kind, 1)
  on conflict (key, month, kind) do update set count = public.usage_monthly.count + 1, updated_at = now()
  returning count;
$$;

revoke all on function public.bump_usage(text, text, text) from public, anon, authenticated;
grant execute on function public.bump_usage(text, text, text) to service_role;
