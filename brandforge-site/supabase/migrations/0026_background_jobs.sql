-- NOTE: named background_jobs because prod already has an unrelated public.jobs table.
-- Jobs table (master brief section 8): scheduled background work
-- for quick wins, nurture sequences, and other async tasks.
--
-- WHAT THIS DOES (additive only, nothing existing is altered):
-- * jobs — stores scheduled work with run_at, status, attempts, and idempotency key
--
-- SAFETY BY DESIGN (same pattern as 0022):
-- - RLS enabled with NO policies: anon/authenticated denied everything; only
--   the service role (lib/project-db.ts, H7 allowlist) reads or writes.
-- - No secrets or prompts in the rows.
-- - Foreign keys on delete cascade: deleted blueprints clean up their jobs.
-- - Additive only. Nothing existing is altered.

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null, -- 'quick_win', 'nurture', etc.
  blueprint_id uuid references public.blueprints(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  run_at timestamptz not null, -- when to execute
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'dead_letter')),
  attempts integer not null default 0,
  payload jsonb not null default '{}'::jsonb, -- job-specific data
  idempotency_key text unique, -- prevent duplicate jobs
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists background_jobs_run_at_idx
  on public.background_jobs (run_at) where status = 'pending';
create index if not exists background_jobs_type_idx
  on public.background_jobs (type);
create index if not exists background_jobs_blueprint_id_idx
  on public.background_jobs (blueprint_id) where blueprint_id is not null;
create index if not exists background_jobs_user_id_idx
  on public.background_jobs (user_id) where user_id is not null;
create index if not exists background_jobs_idempotency_key_idx
  on public.background_jobs (idempotency_key) where idempotency_key is not null;

-- Locked down by default: RLS enabled with NO policies
alter table public.background_jobs enable row level security;

comment on table public.background_jobs is
  'Scheduled background work: quick wins, nurture sequences, async tasks. Executed by /api/cron/jobs worker.';
