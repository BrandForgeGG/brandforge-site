-- Coins that move (BTC, ETH, BNB, SOL, TRX, LTC), 2026-10-15: the dollar price of the coin when the payment opened, held
-- for 30 minutes. Null for stablecoins (always 1).
alter table public.crypto_invoices add column if not exists coin_price numeric(20, 8);
