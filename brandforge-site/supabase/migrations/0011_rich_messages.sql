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


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('conversation-attachments', 'conversation-attachments', false, 10485760,
  array['image/png','image/jpeg','image/webp','application/pdf','text/plain','application/json','application/zip','text/csv','audio/webm','audio/ogg','audio/mpeg','audio/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Conversation participants upload attachments" on storage.objects;
create policy "Conversation participants upload attachments" on storage.objects for insert to authenticated with check (
  bucket_id = 'conversation-attachments'
  and exists (select 1 from public.conversations c where c.id::text = (storage.foldername(name))[1] and public.is_conversation_participant(c.id))
);
