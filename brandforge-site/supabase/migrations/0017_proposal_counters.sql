-- Proposal counter-offer round (lifecycle spec):
--   founder: accept / decline / counter (once)
--   specialist: accept the counter / counter back (once — their last offer) / decline
--   founder: accept / decline the counter-back (no second counter)
--
-- counter_* holds the offer currently on the table; counter_round records who put it there
-- (0 none, 1 founder countered, 2 specialist countered back = final). On acceptance the
-- counter terms are promoted into total_amount / estimated_weeks so the agreement, escrow
-- schedule and funnel all price the deal the two sides actually agreed to.

alter table public.proposals
  add column if not exists counter_total_amount integer,
  add column if not exists counter_weeks_min integer,
  add column if not exists counter_weeks_max integer,
  add column if not exists counter_note text,
  add column if not exists counter_round smallint not null default 0;

comment on column public.proposals.counter_round is
  '0 = no counter, 1 = founder countered, 2 = specialist countered back (final offer).';
