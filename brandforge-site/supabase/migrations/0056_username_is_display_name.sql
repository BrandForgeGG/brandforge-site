-- The username is the name (2026-10-15): one name per person, the one they chose, shown everywhere. display_name always
-- follows the username, whoever writes it (onboarding, Settings, the identity trigger), and existing rows are brought in line.
create or replace function public.profiles_display_follows_username()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.username is not null and new.username <> '' then
    new.display_name := new.username;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_display_follows_username on public.profiles;
create trigger profiles_display_follows_username
  before insert or update of username, display_name on public.profiles
  for each row execute function public.profiles_display_follows_username();

update public.profiles set display_name = username where username is not null and display_name is distinct from username;
