-- Growth tools (T0): shared spine tables for Brand Kit, tool runs, assets, and usage metering.
--
-- WHAT THIS DOES (additive only, nothing existing is altered):
-- * brand_kits — cached brand identity per domain (name, logo, palette, fonts, tone, audience, offer, claims, social links)
-- * tool_runs — every tool execution with status, cost, and result reference
-- * assets — generated creatives, reports, and other outputs
-- * usage_events — metering for cost control and quota enforcement
--
-- SAFETY BY DESIGN:
-- - RLS enabled with NO policies: anon/authenticated denied everything; only
--   the service role (lib/project-db.ts, H7 allowlist) reads or writes.
-- - No secrets or tokens in the rows.
-- - Foreign keys on delete cascade: deleted projects clean up their rows.
-- - Additive only. Nothing existing is altered.

create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.conversations(id) on delete cascade,
  domain text not null,
  name text,
  logo_url text,
  palette jsonb not null default '[]'::jsonb,
  fonts jsonb not null default '[]'::jsonb,
  tone_of_voice text,
  audience text,
  offer text,
  key_claims jsonb not null default '[]'::jsonb,
  social_links jsonb not null default '[]'::jsonb,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_kits_project_id_idx on public.brand_kits (project_id);
create index if not exists brand_kits_domain_idx on public.brand_kits (domain);

create table if not exists public.tool_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.conversations(id) on delete cascade,
  tool_name text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  cost_usd numeric(10,6) not null default 0,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  duration_ms integer,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tool_runs_project_id_idx on public.tool_runs (project_id);
create index if not exists tool_runs_tool_name_idx on public.tool_runs (tool_name);
create index if not exists tool_runs_status_idx on public.tool_runs (status);
create index if not exists tool_runs_created_at_idx on public.tool_runs (created_at);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.conversations(id) on delete cascade,
  tool_run_id uuid references public.tool_runs(id) on delete cascade,
  kind text not null,
  format text not null,
  url text not null,
  thumbnail_url text,
  file_size_bytes integer,
  width integer,
  height integer,
  duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assets_project_id_idx on public.assets (project_id);
create index if not exists assets_tool_run_id_idx on public.assets (tool_run_id);
create index if not exists assets_kind_idx on public.assets (kind);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.conversations(id) on delete cascade,
  event_type text not null,
  tool_name text,
  cost_usd numeric(10,6) not null default 0,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_project_id_idx on public.usage_events (project_id);
create index if not exists usage_events_event_type_idx on public.usage_events (event_type);
create index if not exists usage_events_created_at_idx on public.usage_events (created_at);

alter table public.brand_kits enable row level security;
alter table public.tool_runs enable row level security;
alter table public.assets enable row level security;
alter table public.usage_events enable row level security;

comment on table public.brand_kits is 'Cached brand identity per domain: name, logo, palette, fonts, tone, audience, offer, claims, social links.';
comment on table public.tool_runs is 'Every growth-tool execution with status, cost, and result reference.';
comment on table public.assets is 'Generated creatives, reports, and other tool outputs.';
comment on table public.usage_events is 'Metering for cost control and quota enforcement.';
