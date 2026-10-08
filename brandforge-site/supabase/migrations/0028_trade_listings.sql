-- 0028: Trade Center listings — businesses and creators post what they offer or need.
--
-- A listing is a public card. Contact opens a chat between the two people (the contract is then
-- made there with peer contracts, 0027). RLS on with no policies: reads and writes go through the
-- service role behind route checks, and only status = 'open' rows are ever listed publicly.

CREATE TABLE IF NOT EXISTS trade_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  owner_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('offer', 'request')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  budget_min_cents BIGINT CHECK (budget_min_cents IS NULL OR budget_min_cents >= 0),
  budget_max_cents BIGINT CHECK (budget_max_cents IS NULL OR budget_max_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

CREATE INDEX IF NOT EXISTS trade_listings_open_idx ON trade_listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS trade_listings_owner_idx ON trade_listings (owner_id);

ALTER TABLE trade_listings ENABLE ROW LEVEL SECURITY;
