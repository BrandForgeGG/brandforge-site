-- BrandForge chat-first RLS fixes
--
-- The original supabase-schema.sql enables row level security on the chat tables but never
-- created an INSERT policy for project_context, and no DELETE policy for milestones. Without
-- these, the first AI write of a brand new conversation is rejected by Postgres and the chat
-- tools report the failure to the model.
--
-- Run this once in the Supabase SQL editor (project: brandforge), or apply it with
-- `supabase db push` from brandforge-site/.

-- 1. project_context needs INSERT: the first update_project_context tool call creates the row.
drop policy if exists "Users can insert project_context for own conversations" on project_context;
create policy "Users can insert project_context for own conversations" on project_context
  for insert with check (
    exists (
      select 1 from conversations
      where conversations.id = project_context.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

-- 2. Draft milestones can be deleted when a human proposal replaces the AI plan.
drop policy if exists "Users can delete milestones in own conversations" on milestones;
create policy "Users can delete milestones in own conversations" on milestones
  for delete using (
    exists (
      select 1 from conversations
      where conversations.id = milestones.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

-- 3. A participant row (human operator or builder joining the same chat) can be updated.
drop policy if exists "Users can update participants in own conversations" on participants;
create policy "Users can update participants in own conversations" on participants
  for update using (
    exists (
      select 1 from conversations
      where conversations.id = participants.conversation_id
      and conversations.user_id = auth.uid()
    )
  );
