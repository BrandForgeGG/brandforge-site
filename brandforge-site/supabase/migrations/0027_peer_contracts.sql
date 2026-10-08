-- 0027: peer contracts — a milestone contract between any two people in a chat.
--
-- One payer, one payee. Milestones live in jsonb (they are always read and written as a set and
-- carry their own status, proof link and fee). Amounts are integer cents. RLS is on with no
-- policies: every read and write goes through the service role behind route-level checks.

CREATE TABLE IF NOT EXISTS peer_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  payer_id UUID NOT NULL,
  payee_id UUID NOT NULL,
  title TEXT NOT NULL,
  scope TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  total_cents BIGINT NOT NULL CHECK (total_cents > 0),
  due_date DATE,
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'active', 'disputed', 'completed', 'cancelled')),
  funding_status TEXT NOT NULL DEFAULT 'none'
    CHECK (funding_status IN ('none', 'verifying', 'funded')),
  funding_tx TEXT,
  payer_signed_at TIMESTAMPTZ,
  payee_signed_at TIMESTAMPTZ,
  fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 5,
  CHECK (payer_id <> payee_id)
);

CREATE INDEX IF NOT EXISTS peer_contracts_conversation_idx ON peer_contracts (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS peer_contracts_payer_idx ON peer_contracts (payer_id);
CREATE INDEX IF NOT EXISTS peer_contracts_payee_idx ON peer_contracts (payee_id);

ALTER TABLE peer_contracts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE peer_contracts IS
  'Milestone contract between two chat participants. Service-role only; fee_percent is frozen at creation so later changes never alter a signed deal.';
