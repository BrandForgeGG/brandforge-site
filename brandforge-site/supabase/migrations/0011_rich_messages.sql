-- Editable human messages, tombstone deletion, and reactions.
-- AI/system messages remain immutable: mutation authorization is checked in the API and these
-- columns/table have no client UPDATE/DELETE grants or policies. Reaction rows are intentionally
-- mutated through the API after conversation access is verified.
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  unique(message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

drop policy if exists "Conversation members can read reactions" on public.message_reactions;
create policy "Conversation members can read reactions" on public.message_reactions for select to authenticated using (
  public.is_conversation_participant((select conversation_id from public.messages where id = message_id))
);

drop policy if exists "Participants can add reactions" on public.message_reactions;
create policy "Participants can add reactions" on public.message_reactions for insert to authenticated with check (
  user_id = auth.uid()
  and public.is_conversation_participant((select conversation_id from public.messages where id = message_id))
);

drop policy if exists "Participants can remove own reactions" on public.message_reactions;
create policy "Participants can remove own reactions" on public.message_reactions for delete to authenticated using (user_id = auth.uid());

-- Removed messages disappear from ordinary reads while their ordering and audit context remain.
comment on column public.messages.edited_at is 'Set when a human corrects their own message.';
comment on column public.messages.deleted_at is 'Tombstone timestamp; deleted messages are omitted from transcript reads.';
