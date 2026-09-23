-- Staff inbox access.
--
-- The staff inbox is the operator's working surface: mxstermind.com@gmail.com must be able to
-- see every founder conversation before joining it. RLS only granted the conversation owner
-- and existing participants read access, so the inbox came back empty. These policies add the
-- operator account without widening access for founders or anyone else.

create or replace function public.is_brandforge_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users
    where auth.users.id = auth.uid()
      and lower(auth.users.email) = 'mxstermind.com@gmail.com'
  );
$$;

revoke all on function public.is_brandforge_operator() from public;
grant execute on function public.is_brandforge_operator() to authenticated;

-- 1. The operator can read every founder conversation (staff inbox).
drop policy if exists "Operators can view all conversations" on conversations;
create policy "Operators can view all conversations" on conversations
  for select using (public.is_brandforge_operator());

-- 2. The operator can read every message, so inbox previews are real.
drop policy if exists "Operators can view all messages" on messages;
create policy "Operators can view all messages" on messages
  for select using (public.is_brandforge_operator());

-- 3. The operator can read project context to summarise each conversation.
drop policy if exists "Operators can view all project_context" on project_context;
create policy "Operators can view all project_context" on project_context
  for select using (public.is_brandforge_operator());

-- 4. The operator can add themselves as a participant (join the chat).
drop policy if exists "Operators can join conversations" on participants;
create policy "Operators can join conversations" on participants
  for insert with check (
    public.is_brandforge_operator() and participants.user_id = auth.uid()
  );

-- 5. The operator can move delivery tasks before/after joining, matching the chat-tasks route.
drop policy if exists "Operators can view all tasks" on tasks;
create policy "Operators can view all tasks" on tasks
  for select using (public.is_brandforge_operator());

drop policy if exists "Operators can update all tasks" on tasks;
create policy "Operators can update all tasks" on tasks
  for update using (public.is_brandforge_operator());
