-- Blueprint Engine (master brief 2026-10-04, slices S1-S2): anonymous sessions
-- and blueprint documents. STATUS: an earlier copy was applied 2026-10-04 (before `input`
-- existed); this version adds an idempotent ALTER, so re-running the whole file completes it.
--
-- WHAT THIS DOES: three tables.
-- * blueprint_sessions — an anonymous visitor: an opaque id (carried in the
--   HttpOnly bf_bp cookie, HMAC-signed by the server), a UTC-day run quota, a
--   salted IP hash for the per-IP hourly limit, and a purge date.
-- * blueprints — the document itself as JSONB, owned by a session, versioned.
--   conversation_id stays null until the visitor converts: a conversation is
--   only created then (one chat = one project; auth-before-persist doctrine).
-- * blueprint_revisions — every validated version, so a refine never loses a
--   previous document (audit trail for version comparison in the UI).
--
-- SAFETY BY DESIGN (same pattern as 0019):
-- - RLS enabled with NO policies: anon/authenticated denied everything; only
--   the service role (lib/project-db.ts, H7 allowlist) reads or writes. The
--   client never sees these tables.
-- - No secrets, no prompts, no provider keys in the rows: only the visitor's
--   own input, our generated document, and quota bookkeeping.
-- - merged_user_id / conversation_id reference rows that may not exist yet at
--   apply time and may be deleted later: both ON DELETE SET NULL, so purging a
--   user or a chat never cascades into orphan deletes of history.
-- - Additive only. Nothing existing is altered.

create table if not exists public.blueprint_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  -- Quota bookkeeping: the UTC day the counter belongs to and how many runs the
  -- session has used that day. Rolled in code (lib/blueprint-session.js), never
  -- trusted from the client.
  quota_date date not null default (now() at time zone 'utc')::date,
  quota_count integer not null default 0,

  -- HMAC-salted hash of the visitor IP, truncated. Enough to enforce the hourly
  -- per-IP limit; not reversible back to an address without the secret.
  ip_hash text,

  -- Set when the visitor later signs in (S6 merge): keeps the link so their
  -- blueprints follow the account without an anonymous auth.users row.
  merged_user_id uuid references auth.users(id) on delete set null,

  -- Anonymisation: sessions without a signed-in merge are hard-deleted after
  -- this date by the purge job (S6). Set at creation to now() + retention days.
  purge_after timestamptz
);

create table if not exists public.blueprints (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.blueprint_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  -- The visitor's original intake, kept out of the JSONB document on purpose:
  -- refine prompts need the source text even after `run` replaces the draft,
  -- and user text must never enter the document the validator scans.
  input text not null default '',
  version integer not null default 1,
  status text not null default 'draft'
    check (status in ('draft', 'validated', 'saved', 'proposed')),
  lane text,
  confidence text,
  email text,
  document jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blueprint_revisions (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.blueprints(id) on delete cascade,
  version integer not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  unique (blueprint_id, version)
);

create index if not exists blueprint_sessions_purge_after_idx
  on public.blueprint_sessions (purge_after) where purge_after is not null;
create index if not exists blueprint_sessions_ip_hash_idx
  on public.blueprint_sessions (ip_hash, created_at);
create index if not exists blueprints_session_id_idx
  on public.blueprints (session_id);
create index if not exists blueprints_user_id_idx
  on public.blueprints (user_id) where user_id is not null;
create index if not exists blueprints_conversation_id_idx
  on public.blueprints (conversation_id) where conversation_id is not null;
create index if not exists blueprint_revisions_blueprint_idx
  on public.blueprint_revisions (blueprint_id, version desc);

-- Additive for re-runs: 0022 may already be applied from an earlier copy of
-- this file (before the input column existed). `create table if not exists`
-- cannot add a column to a live table, so the column ships as an idempotent
-- ALTER — safe to run on a fresh database and on an already-applied one.
alter table public.blueprints
  add column if not exists input text not null default '';

-- Locked down by default: RLS enabled with NO policies, so anon/authenticated
-- clients are denied everything and only the service role touches these tables.
alter table public.blueprint_sessions enable row level security;
alter table public.blueprints enable row level security;
alter table public.blueprint_revisions enable row level security;

comment on table public.blueprint_sessions is
  'Anonymous Blueprint Engine visitor: signed-cookie session id, UTC-day run quota, salted ip hash, purge date.';
comment on table public.blueprints is
  'Free blueprint document (JSONB) owned by a session; conversation_id only set on conversion.';
comment on table public.blueprint_revisions is
  'Immutable validated versions of a blueprint (refine history).';
