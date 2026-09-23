-- Open auth + role-based staff access.
--
-- Login is open (any Google account). Staff/admin access comes from profiles.role only.
-- 1. Seed admin/operator roles for the known accounts (idempotent).
-- 2. Replace email-hardcoded is_brandforge_operator() with a profiles.role check.
-- 3. Add is_brandforge_admin() for the application review surface.
-- 4. Stop end users from writing profiles.role (column-level grants; RLS alone allowed it).
-- 5. operator_applications: specialists apply at /apply; admin accepts/declines at
--    /admin/applications. Accept is SECURITY DEFINER (admin cannot update another
--    user's profiles row via RLS).
-- 6. Admins can invite an accepted applicant into a conversation (participants + system
--    message insert policies).

-- ---------- 1. Seed known privileged accounts ----------
-- Untyped literals so this works whether live enum type is user_role or app_role.

insert into public.profiles (id, email, role, updated_at)
select u.id, u.email, 'admin', now()
from auth.users u
where lower(u.email) = 'brandforge.gg@gmail.com'
on conflict (id) do update set role = 'admin', updated_at = now();

insert into public.profiles (id, email, role, updated_at)
select u.id, u.email, 'operator', now()
from auth.users u
where lower(u.email) = 'mxstermind.com@gmail.com'
on conflict (id) do update set role = 'operator', updated_at = now();

update public.profiles p
set role = 'admin', updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) = 'brandforge.gg@gmail.com'
  and p.role::text <> 'admin';

update public.profiles p
set role = 'operator', updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) = 'mxstermind.com@gmail.com'
  and p.role::text = 'viewer';

-- ---------- 2/3. Role helpers (SECURITY DEFINER: bypass profiles RLS) ----------

create or replace function public.is_brandforge_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where profiles.id = auth.uid()
      and profiles.role::text in ('operator', 'admin')
  );
$$;

revoke all on function public.is_brandforge_operator() from public;
grant execute on function public.is_brandforge_operator() to authenticated;

create or replace function public.is_brandforge_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where profiles.id = auth.uid()
      and profiles.role::text = 'admin'
  );
$$;

revoke all on function public.is_brandforge_admin() from public;
grant execute on function public.is_brandforge_admin() to authenticated;

-- Existing policies from 0004 keep working; they call is_brandforge_operator() above.

-- ---------- 4. Column-level grants: only SECURITY DEFINER code may change role ----------
-- RLS "Users can update their own profile" used to let any signed-in user set
-- profiles.role = 'admin'. Revoke table-wide update/insert, re-grant without role.

revoke update on public.profiles from authenticated;
grant update (email, full_name, avatar_url, company_name, created_at, updated_at)
  on public.profiles to authenticated;

revoke insert on public.profiles from authenticated;
grant insert (id, email, full_name, avatar_url, company_name, created_at, updated_at)
  on public.profiles to authenticated;

-- Service role / postgres owner keep full access (default privileges unchanged).

-- ---------- 5. operator_applications ----------

create table if not exists public.operator_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  message text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists operator_applications_pending_user
  on public.operator_applications (user_id)
  where status = 'pending';

alter table public.operator_applications enable row level security;

-- Applicant: insert own pending application; email must match the JWT email.
drop policy if exists "Users can apply as operator" on public.operator_applications;
create policy "Users can apply as operator" on public.operator_applications
  for insert with check (
    user_id = auth.uid()
    and status = 'pending'
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Applicant: read own applications (all statuses).
drop policy if exists "Users can view own applications" on public.operator_applications;
create policy "Users can view own applications" on public.operator_applications
  for select using (user_id = auth.uid());

-- Admin: read every application.
drop policy if exists "Admins can view all applications" on public.operator_applications;
create policy "Admins can view all applications" on public.operator_applications
  for select using (public.is_brandforge_admin());

-- Admin: decline (direct update). Accept goes through accept_operator_application()
-- so profiles.role is written by SECURITY DEFINER, not by this update alone.
drop policy if exists "Admins can update applications" on public.operator_applications;
create policy "Admins can update applications" on public.operator_applications
  for update using (public.is_brandforge_admin())
  with check (public.is_brandforge_admin());

-- Accept: mark application accepted and set profiles.role = 'operator'.
create or replace function public.accept_operator_application(application_id uuid)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  app_row public.operator_applications;
begin
  if not public.is_brandforge_admin() then
    raise exception 'admin access required';
  end if;

  select * into app_row
  from public.operator_applications
  where id = application_id
  for update;

  if app_row.id is null then
    raise exception 'application not found';
  end if;

  if app_row.status <> 'pending' then
    raise exception 'application already reviewed';
  end if;

  update public.operator_applications
  set status = 'accepted',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = application_id
  returning public.operator_applications.* into app_row;

  insert into public.profiles (id, email, role, updated_at)
  values (app_row.user_id, app_row.email, 'operator', now())
  on conflict (id) do update set role = 'operator', updated_at = now();

  return query select app_row.id, app_row.status;
end;
$$;

revoke all on function public.accept_operator_application(uuid) from public;
grant execute on function public.accept_operator_application(uuid) to authenticated;

-- ---------- 6. Admin invite into a conversation ----------
-- Operator self-join policies (0004) only allow participants.user_id = auth.uid().
-- Inviting someone else needs an admin-only insert.

drop policy if exists "Admins can invite participants" on public.participants;
create policy "Admins can invite participants" on public.participants
  for insert with check (public.is_brandforge_admin());

-- System join message for the invited applicant (admin posts without being a participant).
drop policy if exists "Admins can post system messages" on public.messages;
create policy "Admins can post system messages" on public.messages
  for insert with check (public.is_brandforge_admin());

-- ---------- 7. First login after open auth: seed staff roles from known emails ----------
-- handle_new_user (0002) left role as 'viewer'. Re-run-safe: on insert set the role; on
-- re-auth conflict only promote known emails (never demote an accepted operator).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role, company_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    case lower(coalesce(new.email, ''))
      when 'brandforge.gg@gmail.com' then 'admin'::public.user_role
      when 'mxstermind.com@gmail.com' then 'operator'::public.user_role
      else
        case
          when coalesce(new.raw_user_meta_data ->> 'role', 'viewer')
            in ('admin', 'operator', 'client', 'designer', 'viewer')
          then (coalesce(new.raw_user_meta_data ->> 'role', 'viewer'))::public.user_role
          else 'viewer'::public.user_role
        end
    end,
    new.raw_user_meta_data ->> 'company_name'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      company_name = excluded.company_name,
      role = case lower(coalesce(excluded.email, ''))
        when 'brandforge.gg@gmail.com' then 'admin'::public.user_role
        when 'mxstermind.com@gmail.com' then 'operator'::public.user_role
        else public.profiles.role
      end,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Promote already-signed-in known accounts whose profiles were created as 'viewer'
-- before this migration (covers rows that predate auth.users seeding above).
update public.profiles p
set role = 'admin', updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) = 'brandforge.gg@gmail.com'
  and p.role::text <> 'admin';

update public.profiles p
set role = 'operator', updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) = 'mxstermind.com@gmail.com'
  and p.role::text = 'viewer';

-- Table grants for the new application table (Supabase defaults are not guaranteed here).
grant select, insert on public.operator_applications to authenticated;
grant update (status, reviewed_by, reviewed_at) on public.operator_applications to authenticated;
revoke all on public.operator_applications from anon;
