-- Crypto payments (2026-10-15): stablecoins from Trust Wallet or any wallet, checked on-chain. One row per payment the
-- server prices: what it pays for (a plan, an escrow agreement or a member-to-member contract), the network, the exact
-- amount and the address. A transaction can pay one invoice only (tx_hash is unique), so a payment cannot be claimed
-- twice. Server only: row level security on, no policies, like the other money tables.
create table if not exists public.crypto_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('plan', 'agreement', 'peer')),
  ref_id text not null,
  network text not null,
  amount text not null,
  price_cents integer not null,
  currency text not null,
  rate numeric(12, 6) not null,
  address text not null,
  status text not null default 'open' check (status in ('open', 'paid', 'expired')),
  tx_hash text unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz
);

create index if not exists crypto_invoices_user_idx on public.crypto_invoices (user_id, created_at desc);
create index if not exists crypto_invoices_ref_idx on public.crypto_invoices (purpose, ref_id, status);

alter table public.crypto_invoices enable row level security;
