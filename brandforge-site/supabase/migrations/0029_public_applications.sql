-- 0029: specialist applications without an account.
--
-- Anyone can apply from /apply without signing in; registering with the same email afterwards
-- links the application (and grants access if it was accepted in the meantime). Applications
-- keep their existing admin-only read/update policies; the app writes guest rows through the
-- service role behind route checks.

ALTER TABLE public.operator_applications ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.operator_applications
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS specialty TEXT,
  ADD COLUMN IF NOT EXISTS links TEXT;

-- One pending application per email, whether or not it has an account yet.
CREATE UNIQUE INDEX IF NOT EXISTS operator_applications_pending_email
  ON public.operator_applications (lower(email))
  WHERE status = 'pending';

-- Accepting a guest application links it to the profile with that email when one exists; if the
-- person registers later, the app claims it on their first visit to /apply.
CREATE OR REPLACE FUNCTION public.accept_operator_application(application_id uuid)
RETURNS TABLE(id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  app_row public.operator_applications;
  target uuid;
begin
  if not public.is_brandforge_admin() then
    raise exception 'admin access required';
  end if;

  select oa.* into app_row
  from public.operator_applications oa
  where oa.id = application_id
  for update;

  if app_row.id is null then
    raise exception 'application not found';
  end if;

  if app_row.status <> 'pending' then
    raise exception 'application already reviewed';
  end if;

  target := app_row.user_id;
  if target is null then
    select p.id into target from public.profiles p where lower(p.email) = lower(app_row.email) limit 1;
  end if;

  update public.operator_applications oa
  set status = 'accepted',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      user_id = coalesce(oa.user_id, target)
  where oa.id = application_id
  returning oa.* into app_row;

  if target is not null then
    insert into public.profiles (id, email, role, updated_at)
    values (target, app_row.email, 'operator', now())
    on conflict (id) do update set role = 'operator', updated_at = now();
  end if;

  return query select app_row.id, app_row.status;
end;
$function$;
