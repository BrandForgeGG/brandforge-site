-- A chat is the main assistant for one goal (2026-10-10): a Trade listing or something made in the chat. The link
-- lets the chat show what it is for, lets the AI stay on that goal, and lets a listing reopen its assistant.
-- One goal per chat, one assistant chat per listing. RLS on with no policies: only the server reads and writes.
create table if not exists public.conversation_links (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  kind text not null check (kind in ('listing', 'creation')),
  ref_id uuid,
  title text not null,
  summary text,
  created_at timestamptz not null default now()
);
create unique index if not exists conversation_links_ref_idx on public.conversation_links (kind, ref_id) where ref_id is not null;
alter table public.conversation_links enable row level security;
