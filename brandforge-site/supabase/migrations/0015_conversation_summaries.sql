-- 0015: one-round-trip conversation summaries for the sidebar / staff inbox.
--
-- buildConversationSummaries (lib/project-db.ts) fetched the conversations and
-- then messages, project_context and participants by .in(ids) — pulling full
-- message content for up to 50 conversations just to compute counts, previews
-- and the first founder message. This function does the same work with one
-- grouped query and returns the raw pieces; presentation (title fallbacks,
-- truncation, staff-name fallback, final activity sort) stays in JS exactly
-- where it is today, so the ConversationSummary shape does not change.
--
-- Parity notes:
--   * conversations: newest first, limit 50, optional owner filter — same as now;
--   * conversations with zero messages are excluded (JS skipped them);
--   * message_count / last_activity / last content / first 'user' content come
--     from one aggregate per conversation (ties on created_at resolve the same
--     arbitrary way the JS array order did);
--   * first staff participant per conversation = lowest joined_at among
--     operator/builder/observer (JS took the first in joined_at order);
--   * project_name = the conversation's project_context row (JS took whatever
--     the unordered result happened to return; there is one row per chat).
--
-- security invoker: RLS still scopes whoever calls. Server routes call as the
-- service role (bypasses RLS) exactly as before; execute is revoked from the
-- client roles anyway because only the server needs it.

create or replace function public.get_conversation_summaries(
  p_user_id uuid default null
)
returns table (
  id uuid,
  title text,
  status text,
  created_at timestamptz,
  user_id uuid,
  message_count bigint,
  last_activity timestamptz,
  last_content text,
  first_user_content text,
  project_name text,
  staff_name text,
  staff_joined_at timestamptz
)
language sql
stable
security invoker
as $$
  with scoped as (
    select c.id, c.title, c.status, c.created_at, c.user_id
    from conversations c
    where p_user_id is null or c.user_id = p_user_id
    order by c.created_at desc
    limit 50
  ),
  msgs as (
    select m.conversation_id,
           count(*) as message_count,
           max(m.created_at) as last_activity,
           (array_agg(m.content order by m.created_at desc))[1] as last_content,
           (array_agg(m.content order by m.created_at asc)
             filter (where m.sender_type = 'user'))[1] as first_user_content
    from messages m
    where m.conversation_id in (select scoped.id from scoped)
    group by m.conversation_id
  ),
  first_staff as (
    select distinct on (p.conversation_id)
           p.conversation_id, p.display_name, p.joined_at
    from participants p
    where p.conversation_id in (select scoped.id from scoped)
      and p.role in ('operator', 'builder', 'observer')
    order by p.conversation_id, p.joined_at asc
  )
  select s.id,
         s.title,
         s.status,
         s.created_at,
         s.user_id,
         msgs.message_count,
         msgs.last_activity,
         msgs.last_content,
         msgs.first_user_content,
         (select pc.project_name
          from project_context pc
          where pc.conversation_id = s.id
          limit 1),
         fs.display_name,
         fs.joined_at
  from scoped s
  join msgs on msgs.conversation_id = s.id
  left join first_staff fs on fs.conversation_id = s.id;
$$;

comment on function public.get_conversation_summaries(uuid) is
  'Sidebar/staff-inbox summaries for up to 50 conversations in one query (port of lib/project-db.buildConversationSummaries; presentation stays in JS).';

-- Server-only utility: the routes already fetch this as the service role.
revoke execute on function public.get_conversation_summaries(uuid) from public, anon, authenticated;
grant execute on function public.get_conversation_summaries(uuid) to service_role;
