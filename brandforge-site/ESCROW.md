# Escrow runbook — verifying funding and releasing milestones

Operator-facing guide for the admin-verified crypto escrow. The product promise is "a human
confirms every transfer" — this document is how that human does it consistently.

## The money flow (status machine)

```
agreement accepted
  → founder sends the FULL agreement total in crypto to the deposit wallet
  → founder pastes the tx hash in the project panel        payments: scheduled → pending
  → STAFF VERIFY on-chain                                  payments: pending → paid
                                                           agreement: accepted → funded
                                                           conversation: → ACTIVE (work begins)
  → founder approves a delivered milestone in chat
  → STAFF RELEASE that milestone                           payment:  paid → released
  → staff send the released amount to the operator
```

Client-facing labels: `pending` shows as "verifying", `paid` as "held by BrandForge".

## Verify a funding transaction

The founder submits one tx hash covering **all** scheduled payments (the full agreement total).

1. Open the project chat → the funding card shows the submitted hash and network.
2. Open the hash in the explorer for that network (e.g. Tronscan for USDT TRC-20).
3. Check all three, every time:
   - **Destination** is exactly the BrandForge deposit wallet (the address shown in the panel /
     `NEXT_PUBLIC_DEPOSIT_WALLET_ADDRESS`).
   - **Amount** equals the agreement total shown on the funding card.
   - **Confirmations** are final on that network (don't verify a pending tx).
4. If all three pass: click **Verify** in the panel. The agreement flips to `funded`, the
   conversation goes ACTIVE, and the founder sees "held by BrandForge". Work may begin.
5. If anything fails: click **Reject** and write the reason in plain language — it is posted
   into the chat as a system message and the payments return to `scheduled` so the founder can
   resubmit.

Never verify from a screenshot or a hash pasted outside the panel. Never ask the founder for
keys, seed phrases or wallet access — only the public transaction hash.

## Release a milestone payment

1. The operator posts the delivered work in the chat.
2. The **founder** approves the milestone in the chat. Funds are never auto-released and never
   released on the operator's say-so.
3. Click **Release to operator** on that payment in the panel.
4. Send the released amount to the operator from the payout wallet and note it in the staff
   channel.

## Edge cases

- **Wrong amount / wrong network / hash not found** → Reject with the specific reason.
- **Duplicate or already-used hash** → the API blocks resubmission (409); check which agreement
  already consumed it before doing anything.
- **Founder unresponsive after a delivery** → nudge in chat. Still no auto-release: escalate to
  the admin if it stalls beyond the timeline in the agreement.
- **Disputed milestone** → founder should NOT approve; mediate per the Refund Policy
  (`/refunds`). Released funds are earned; unreleased funds can be refunded.
- **Refund request** → follow `/refunds`: unreleased amounts go back minus network fees, in the
  same crypto and network, to the funding wallet unless the founder asks otherwise in writing.

## Where things live

- Funding panel UI: `components/project-context-panel.tsx`
- API: `POST/PATCH /api/payments` (`app/api/payments/route.ts`)
- Money writes (service role): `lib/project-db.ts`
- Tx-hash validation: `lib/crypto-payments.js`
- Schema + RLS: `supabase/migrations/0007_admin_crypto_escrow.sql`
- Deposit wallet config: `NEXT_PUBLIC_DEPOSIT_WALLET_ADDRESS` / `NEXT_PUBLIC_DEPOSIT_NETWORK`
  (Vercel env; the address is public by design, the payout wallet is never in the app)
