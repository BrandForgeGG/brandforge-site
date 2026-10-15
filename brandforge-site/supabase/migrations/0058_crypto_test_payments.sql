-- A $1 test payment (2026-10-15): staff can run the whole crypto checkout end to end, from Trust Wallet to the on-chain
-- check, without buying anything.
alter table public.crypto_invoices drop constraint if exists crypto_invoices_purpose_check;
alter table public.crypto_invoices add constraint crypto_invoices_purpose_check check (purpose in ('plan', 'agreement', 'peer', 'test'));
