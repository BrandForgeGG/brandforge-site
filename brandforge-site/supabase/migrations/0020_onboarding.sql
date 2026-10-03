-- 0020_onboarding.sql
-- First-run onboarding: terms acceptance, promotional consent, date of birth,
-- and the username step. Run this BEFORE deploying the onboarding build —
-- /api/identity reports onboarding_completed from these columns.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists date_of_birth date,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz;

-- Everyone who exists today predates the onboarding flow: mark them done so
-- only new signups ever see the wizard. The fresh column stays NULL for
-- accounts created after this migration runs.
update public.profiles
   set onboarding_completed_at = coalesce(onboarding_completed_at, updated_at, created_at, now())
 where onboarding_completed_at is null;

-- 0006 revoked table-wide UPDATE and re-granted only a fixed column list, so the
-- identity columns added in 0009 (and the onboarding columns added here) were
-- never writable from the app. This restores username/display-name edits and
-- makes the onboarding save path work on the RLS (session) client.
grant update (username, display_name, date_of_birth, terms_accepted_at, marketing_opt_in, onboarding_completed_at)
  on public.profiles to authenticated;
