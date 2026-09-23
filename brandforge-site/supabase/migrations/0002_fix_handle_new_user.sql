-- Fix signup: handle_new_user must write the user's email into profiles.
--
-- The live database runs an older version of the trigger that inserts
-- (id, full_name, role, company_name) without email, so every signup fails with
-- "null value in column email of relation profiles violates not-null constraint"
-- and the auth.users insert rolls back. This migration replaces the function with
-- the version from supabase/schema.sql (which does insert email).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- role is a USER_ROLE enum on the live database (not app_role as schema.sql suggests):
  -- plain text from user metadata cannot be inserted directly, so only known labels are
  -- cast and everything else falls back to 'viewer' instead of aborting signup.
  -- (No DECLARE block on purpose: keep this function to a single BEGIN/END body.)
  insert into public.profiles (id, email, full_name, avatar_url, role, company_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    case
      when coalesce(new.raw_user_meta_data ->> 'role', 'viewer')
        in ('admin', 'operator', 'client', 'designer', 'viewer')
      then (coalesce(new.raw_user_meta_data ->> 'role', 'viewer'))::public.user_role
      else 'viewer'::public.user_role
    end,
    new.raw_user_meta_data ->> 'company_name'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      company_name = excluded.company_name,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
