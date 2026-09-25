-- Task-board depth: due dates + assignee picker.
--
-- The chat-first `tasks` table (conversation_id, milestone_id, status, assignee_name) reached
-- production without its own CREATE TABLE migration, so `due_date` / `assignee_id` may or may
-- not exist depending on how the table was first created. Add both idempotently; the app only
-- writes them through PATCH /api/chat-tasks (service role after role checks), never from RLS.
alter table public.tasks
  add column if not exists due_date timestamptz,
  add column if not exists assignee_id uuid references auth.users(id) on delete set null;

comment on column public.tasks.due_date is
  'Delivery target set by staff from the task board (PATCH /api/chat-tasks action=schedule).';
comment on column public.tasks.assignee_id is
  'Staff member the task is assigned to (participants row); assignee_name stays display truth.';
