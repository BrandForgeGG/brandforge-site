-- Traffic-source classification for revenue hygiene (P3).
--
-- PROBLEM: probe, e2e and staff-seeded rows are indistinguishable from real user
-- activity in `conversations` and `funnel_events`, so growth numbers mix test
-- traffic with revenue. Tonight's own verification runs are in those tables.
--
-- WHAT THIS DOES: adds a `source` label to both tables. Real traffic keeps the
-- default without any code path changing behavior; synthetic traffic opts in
-- explicitly per request (routes accept an optional, validated `source` field).
-- Dashboards and the digest then default to `source = 'organic'`.
--
-- SAFETY: purely additive (two columns + comments). No backfill — existing rows
-- keep the default, which is honest for all but the known probe windows. Nothing
-- is renamed, dropped, deleted or retyped. Safe to apply at any time; the route
-- and dashboard wiring lands in a follow-up commit after this is applied.
--
-- STATUS: PROPOSED — awaiting founder "go". NOT applied.

alter table public.conversations
  add column if not exists source text not null default 'organic';

comment on column public.conversations.source is
  'Traffic source: organic = real user activity, test = probes, e2e runs and staff-seeded rows. Revenue queries exclude test.';

alter table public.funnel_events
  add column if not exists source text not null default 'organic';

comment on column public.funnel_events.source is
  'Traffic source: organic = real user activity, test = probes, e2e runs and staff-seeded rows. Revenue queries exclude test.';
