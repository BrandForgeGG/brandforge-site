-- 0043: chats you were added to show up in your sidebar, not only chats you started.
--
-- get_conversation_summaries scoped the list to conversations the caller OWNS. Someone who hits Hire on a listing
-- starts the chat, and the listing's owner is added to it as a participant, so for the listing's owner the chat
-- never appeared (and the same was true for a teammate invited into a chat). A conversation is now in scope when
-- the person owns it OR is a participant in it. Everything else in the function is unchanged.

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
    where p_user_id is null
       or c.user_id = p_user_id
       or exists (
         select 1 from participants me
         where me.conversation_id = c.id and me.user_id = p_user_id
       )
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
