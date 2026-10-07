-- Quick wins v1 (master brief section 5): free, useful deliverables
-- generated from a blueprint, shareable by opt-in link, delivered within ~30 min.
--
-- WHAT THIS DOES (additive only, nothing existing is altered):
-- * quick_wins — stores quick win deliverables with status, output, and share token
--
-- SAFETY BY DESIGN (same pattern as 0022):
-- - RLS enabled with NO policies: anon/authenticated denied everything; only
--   the service role (lib/project-db.ts, H7 allowlist) reads or writes.
-- - No secrets or prompts in the rows.
-- - blueprint_id foreign key on delete cascade: deleted blueprints clean up their wins.
-- - Additive only. Nothing existing is altered.

create table if not exists public.quick_wins (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.blueprints(id) on delete cascade,
  kind text not null, -- 'website_audit', 'clip_plan', 'software_scope', etc.
  status text not null default 'pending'
    check (status in ('pending', 'running', 'delivered', 'failed')),
  output jsonb, -- the actual quick win content (varies by kind)
  share_token text unique, -- unguessable token for opt-in public links
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists quick_wins_blueprint_id_idx
  on public.quick_wins (blueprint_id);
create index if not exists quick_wins_share_token_idx
  on public.quick_wins (share_token) where share_token is not null;
create index if not exists quick_wins_status_idx
  on public.quick_wins (status);

-- Locked down by default: RLS enabled with NO policies
alter table public.quick_wins enable row level security;

comment on table public.quick_wins is
  'Free quick-win deliverables generated from a blueprint: audit, clip plan, software scope. Shareable by opt-in link.';
