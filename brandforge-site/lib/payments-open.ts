import { stripeConfigured } from '@/lib/stripe';

// "Pay now" opens only when both ways to pay are connected: card (Stripe keys) and crypto (the deposit wallet). Until
// then every Pay now button shows as locked and says so, and the checkout route refuses. PAYMENTS_OPEN=false closes it
// again at any time without a deploy.
export function paymentStatus(): { open: boolean; card: boolean; crypto: boolean } {
  const card = stripeConfigured();
  const crypto = Boolean(String(process.env.NEXT_PUBLIC_DEPOSIT_WALLET_ADDRESS ?? '').trim());
  const closed = String(process.env.PAYMENTS_OPEN ?? '').trim().toLowerCase() === 'false';
  return { open: card && crypto && !closed, card, crypto };
}
