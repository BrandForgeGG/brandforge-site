-- Realtime live message delivery + presence.
--
-- Supabase Realtime delivers `postgres_changes` only for tables listed in the
-- `supabase_realtime` publication. No app table was in it, so every live update had to be
-- faked with a polling loop. Add `messages` (and `participants`, so a staff "team in chat"
-- marker appears without a refresh) idempotently.
--
-- Replica identity: the default is sufficient because the app never filters or resumes by
-- cursor, but FULL is required for UPDATE/DELETE payloads to carry the old row.
alter table public.messages replica identity full;
alter table public.participants replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;
end
$$;

comment on table public.messages is
  'Chat transcript. Published to supabase_realtime so open chats update live without polling.';