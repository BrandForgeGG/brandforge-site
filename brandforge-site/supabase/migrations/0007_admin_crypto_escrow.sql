-- 0007_admin_crypto_escrow.sql
--
-- Admin-verified crypto escrow: clients fund agreements in crypto to a BrandForge-controlled
-- deposit wallet, staff verify the transfer on-chain, and release milestone payments to the
-- operator after the founder approves the delivered work.
--
-- This migration also closes the RLS gap on the money tables: proposals, agreements and
-- payments were created in 0001 without any policies. All money writes now run through the
-- service role after the API route has authorized the caller, so authenticated users get
-- read-only visibility scoped to their own conversations and no write policies at all.

-- 1. Funding evidence on payments ----------------------------------------------------------

alter table public.payments
  add column if not exists tx_hash text,
  add column if not exists network text,
  add column if not exists submitted_at timestamptz;

comment on column public.payments.tx_hash is
  'Transaction hash the client submitted for the full agreement funding.';
comment on column public.payments.network is
  'Human-readable network label, e.g. "USDT (TRC-20)".';
comment on column public.payments.submitted_at is
  'When the client submitted the funding transaction hash.';

-- 2. Row level security on the money tables -------------------------------------------------
-- SELECT policies reuse the SECURITY DEFINER helpers from 0005 so they cannot recurse into
-- the conversations/participants policies. No insert/update/delete policies exist on
-- purpose: the API writes as the service role, which bypasses RLS.

alter table public.proposals enable row level security;
alter table public.agreements enable row level security;
alter table public.payments enable row level security;

create policy "Conversation members can view proposals"
  on public.proposals for select
  using (
    public.owns_conversation(proposals.conversation_id)
    or public.is_conversation_participant(proposals.conversation_id)
  );

create policy "Conversation members can view agreements"
  on public.agreements for select
  using (
    public.owns_conversation(agreements.conversation_id)
    or public.is_conversation_participant(agreements.conversation_id)
  );

create policy "Conversation members can view payments"
  on public.payments for select
  using (
    public.owns_conversation(payments.conversation_id)
    or public.is_conversation_participant(payments.conversation_id)
  );
