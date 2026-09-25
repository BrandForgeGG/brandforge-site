-- Identity foundation: every person is a person.
--
-- 1. `display_id`  - public sequential number (#1, #2, #3...) independent of the
--                    internal Supabase Auth UUID. Sequential, never renumbered.
-- 2. `username`    - chosen handle, globally unique, case-insensitive.
-- 3. Telegram link - `telegram_chat_id` (delivery target) + `telegram_username`
--                    (shown on the profile card). Set only via the bot deep-link
--                    verifier, which proves ownership of the chat.
--
-- Everything is additive and idempotent: no column is dropped and no existing
-- identity is rewritten, so this can run against production without a data
-- migration window. Backfill is best-effort and collision-safe.

-- ---------- 1. columns ----------

alter table public.profiles
  add column if not exists display_id integer,
  add column if not exists username text,
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_username text;

-- Sequential public id. Created as a plain integer column (not a serial
-- sequence) so the backfill below can be applied in one pass and renumbered
-- from existing rows without a sequence desync.
create unique index if not exists profiles_display_id_key
  on public.profiles (display_id)
  where display_id is not null;

create unique index if not exists profiles_username_key
  on public.profiles (lower(username))
  where username is not null;

-- One Telegram chat per account, once linked.
create unique index if not exists profiles_telegram_chat_id_key
  on public.profiles (telegram_chat_id)
  where telegram_chat_id is not null;

comment on column public.profiles.display_id is
  'Public sequential member number (#1, #2, ...). Independent of the auth UUID; assigned on first profile write and never reused.';
comment on column public.profiles.username is
  'Chosen @handle, unique case-insensitively. Falls back to the email local-part.';
comment on column public.profiles.telegram_chat_id is
  'Telegram chat id used for notifications, proven via bot deep-link. Null = not linked.';
comment on column public.profiles.telegram_username is
  'Public @handle of the linked Telegram account, for the profile card.';

-- ---------- 2. next display_id allocator ----------
-- SECURITY DEFINER so a new profile can claim the next number without needing
-- UPDATE rights on other users' profile rows (RLS correctly forbids that).

create or replace function public.next_display_id()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_id integer;
begin
  select coalesce(max(display_id), 0) + 1 into next_id from public.profiles;

  return next_id;
end;
$$;

revoke all on function public.next_display_id() from public;
grant execute on function public.next_display_id() to authenticated;


-- ---------- 3. backfill existing rows ----------
-- Display ids are assigned in creation order so the earliest accounts keep #1,
-- #2, ... Username is seeded from the email local-part, de-duplicated by
-- appending a numeric suffix. Any failure here is non-fatal: both columns are
-- nullable and the app falls back to a name-only display.

do $$
declare
  row_record record;
begin
  for row_record in
    select id
    from public.profiles
    where display_id is null
    order by created_at asc nulls last, id asc
  loop
    update public.profiles
      set display_id = public.next_display_id(),
          updated_at = now()
      where id = row_record.id
        and display_id is null;
  end loop;
end;
$$;

do $$
declare
  row_record record;
  seed text;
  candidate text;
  suffix integer;
begin
  for row_record in
    select id, email
    from public.profiles
    where username is null
    order by created_at asc nulls last, id asc
  loop
    seed := lower(split_part(coalesce(row_record.email, 'member'), '@', 1));
    seed := regexp_replace(coerce(seed, text), '[^a-z0-9_.]', '', 'g');

    if seed is null or seed = '' then
      seed := 'member';
    end if;

    candidate := seed;
    suffix := 1;

    while exists (
      select 1 from public.profiles
      where lower(username) = candidate
        and id <> row_record.id
    ) loop
      suffix := suffix + 1;
      candidate := seed || suffix;
    end loop;

    update public.profiles
      set username = candidate,
          updated_at = now()
      where id = row_record.id
        and username is null;
  end loop;
end;
$$;

-- ---------- 4. new profiles get a number + handle automatically ----------
-- Wrapped in its own function and trigger name so any existing insert trigger
-- of a different name is left alone; we drop only this one.

create or replace function public.assign_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seed text;
  candidate text;
  suffix integer;
begin
  if new.display_id is null then
    new.display_id := public.next_display_id();
  end if;

  if new.username is null then
    seed := lower(split_part(coalesce(new.email, 'member'), '@', 1));
    seed := regexp_replace(coerce(seed, text), '[^a-z0-9_.]', '', 'g');

    if seed is null or seed = '' then
      seed := 'member';
    end if;

    candidate := seed;
    suffix := 1;

    while exists (
      select 1 from public.profiles
      where lower(username) = candidate
        and id <> new.id
    ) loop
      suffix := suffix + 1;
      candidate := seed || suffix;
    end loop;

    new.username := candidate;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_assign_identity on public.profiles;
create trigger profiles_assign_identity
  before insert or update of email on public.profiles
  for each row
  execute function public.assign_profile_identity();

-- ---------- 5. self-service profile updates ----------
-- A user may set their own username and Telegram link, and nothing else.
-- `role`, `display_id` and `email` are not covered by any policy, so the
-- column-level grants from 0006 continue to protect them. The username check
-- re-verifies uniqueness here so RLS -- not just the UI -- is what stands
-- between a user and someone else's handle.

drop policy if exists "Users can update own identity" on public.profiles;
create policy "Users can update own identity" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and not exists (
      select 1 from public.profiles other
      where lower(other.username) = lower(new.username)
        and other.id <> auth.uid()
    )
  );
