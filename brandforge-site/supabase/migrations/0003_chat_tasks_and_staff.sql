-- Chat tasks and staff roles.
--
-- 1. The chat-first `tasks` table (conversation_id, milestone_id, status TODO | IN_PROGRESS |
--    REVIEW | DONE) needs policies. Without them the AI's task drafts and every staff action
--    are rejected by RLS. AI drafts are rewritten in place and superseded drafts are marked
--    DONE, so INSERT + UPDATE suffice.
drop policy if exists "Users can view tasks in own conversations" on tasks;
create policy "Users can view tasks in own conversations" on tasks
  for select using (
    exists (
      select 1 from conversations
      where conversations.id = tasks.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert tasks in own conversations" on tasks;
create policy "Users can insert tasks in own conversations" on tasks
  for insert with check (
    exists (
      select 1 from conversations
      where conversations.id = tasks.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update tasks in own conversations" on tasks;
create policy "Users can update tasks in own conversations" on tasks
  for update using (
    exists (
      select 1 from conversations
      where conversations.id = tasks.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

-- 2. Staff may read every conversation they were added to. The base policies only cover the
--    conversation owner, so joined operators/builders/observers would see an empty chat.
drop policy if exists "Participants can view own conversations" on conversations;
create policy "Participants can view own conversations" on conversations
  for select using (
    exists (
      select 1 from participants
      where participants.conversation_id = conversations.id
      and participants.user_id = auth.uid()
    )
  );

drop policy if exists "Participants can view messages" on messages;
create policy "Participants can view messages" on messages
  for select using (
    exists (
      select 1 from participants
      where participants.conversation_id = messages.conversation_id
      and participants.user_id = auth.uid()
    )
  );

drop policy if exists "Participants can insert messages" on messages;
create policy "Participants can insert messages" on messages
  for insert with check (
    exists (
      select 1 from participants
      where participants.conversation_id = messages.conversation_id
      and participants.user_id = auth.uid()
    )
  );

-- 3. The conversation owner may manage the staff on their chat.
drop policy if exists "Users can delete participants in own conversations" on participants;
create policy "Users can delete participants in own conversations" on participants
  for delete using (
    exists (
      select 1 from conversations
      where conversations.id = participants.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

-- 4. Staff may read and move tasks on chats they joined.
drop policy if exists "Participants can view tasks" on tasks;
create policy "Participants can view tasks" on tasks
  for select using (
    exists (
      select 1 from participants
      where participants.conversation_id = tasks.conversation_id
      and participants.user_id = auth.uid()
    )
  );

drop policy if exists "Participants can update tasks" on tasks;
create policy "Participants can update tasks" on tasks
  for update using (
    exists (
      select 1 from participants
      where participants.conversation_id = tasks.conversation_id
      and participants.user_id = auth.uid()
    )
  );
