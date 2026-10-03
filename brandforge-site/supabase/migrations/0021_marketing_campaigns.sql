-- Campaigns tracker for the distribution department (admin dashboard).
--
-- A campaign is one tracked outbound push: a directory submission, a launch
-- post, or an outreach email. It is deliberately NOT the same as
-- marketing_posts (the scheduled auto-poster queue): campaigns track human
-- submissions to third-party sites where the outcome (live URL, declined)
-- arrives later.
--
-- SAFETY: same pattern as marketing_posts — RLS enabled with NO policies, so
-- only the service role reads/writes. Admin routes verify the caller is an
-- admin before touching this table; the table itself never trusts the client.
--
-- Additive only. Safe to run in any order with the deploy: the dashboard reads
-- fail gracefully (clear "not applied yet" message) until this exists.

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Human-facing name of the target: "Product Hunt", "Indie Hackers", ...
  name text not null,

  -- What kind of push this is. 'directory' = launch/submission directory,
  -- 'launch' = product launch platforms, 'outreach' = direct messages/pitches,
  -- 'other' = anything else the founder wants to track.
  kind text not null default 'directory'
    check (kind in ('directory', 'launch', 'outreach', 'other')),

  -- Where to submit (never a secret — public URLs only).
  target_url text,

  -- Optional grouping label the founder uses (e.g. "dev tools", "AI").
  category text,

  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'submitted', 'live', 'declined', 'skipped')),

  -- Free-form notes: requirements of the listing, account used, follow-up date.
  notes text,

  -- Set when the campaign succeeds: the public page where it went live.
  live_url text,

  submitted_at timestamptz
);

create index if not exists marketing_campaigns_status_idx
  on public.marketing_campaigns (status, created_at desc);

alter table public.marketing_campaigns enable row level security;

comment on table public.marketing_campaigns is
  'Distribution campaigns: directory submissions, launches and outreach tracked by status (service-role only, same as marketing_posts).';
