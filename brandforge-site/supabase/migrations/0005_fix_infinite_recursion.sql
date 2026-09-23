-- Break the infinite recursion between conversations <-> participants RLS policies.
--
-- "Participants can view own conversations" on conversations queries participants,
-- and "Users can view participants in own conversations" on participants queries
-- conversations. Postgres detects the cycle and rejects the query with
-- "infinite recursion detected in policy for relation conversations".
--
-- Fix: route both checks through SECURITY DEFINER helpers that bypass RLS,
-- so neither policy triggers the other.

-- Helper: does auth.uid() own this conversation? Bypasses conversations RLS.
create or replace function public.owns_conversation(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conversations
    where conversations.id = conv_id
    and conversations.user_id = auth.uid()
  );
$$;

revoke all on function public.owns_conversation(uuid) from public;
grant execute on function public.owns_conversation(uuid) to authenticated;

-- Helper: is auth.uid() a participant on this conversation? Bypasses participants RLS.
create or replace function public.is_conversation_participant(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from participants
    where participants.conversation_id = conv_id
    and participants.user_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

-- 1. Participants SELECT: use owns_conversation() instead of a subquery on conversations.
drop policy if exists "Users can view participants in own conversations" on participants;
create policy "Users can view participants in own conversations" on participants
  for select using (
    public.owns_conversation(participants.conversation_id)
    or participants.user_id = auth.uid()
  );

-- 2. Conversations SELECT (participants): use is_conversation_participant() instead of a
--    subquery on participants.
drop policy if exists "Participants can view own conversations" on conversations;
create policy "Participants can view own conversations" on conversations
  for select using (
    public.is_conversation_participant(conversations.id)
  );

-- 3. Participants INSERT / UPDATE / DELETE also subquery conversations — route them
--    through owns_conversation() so staff joins and owner management keep working
--    without re-entering the cycle.
drop policy if exists "Users can insert participants in own conversations" on participants;
create policy "Users can insert participants in own conversations" on participants
  for insert with check (
    public.owns_conversation(participants.conversation_id)
  );

drop policy if exists "Users can update participants in own conversations" on participants;
create policy "Users can update participants in own conversations" on participants
  for update using (
    public.owns_conversation(participants.conversation_id)
  );

drop policy if exists "Users can delete participants in own conversations" on participants;
create policy "Users can delete participants in own conversations" on participants
  for delete using (
    public.owns_conversation(participants.conversation_id)
  );
