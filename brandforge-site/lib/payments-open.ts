import { stripeConfigured } from '@/lib/stripe';
import { enabledNetworks } from '@/lib/crypto-chains.js';

// "Pay now" opens when at least one way to pay is connected: card (Stripe keys) or crypto (a receiving address for at
// least one network: stablecoins from Trust Wallet or any wallet, checked on-chain). PAYMENTS_OPEN=false closes it again
// at any time without a deploy.
export function paymentStatus(): { open: boolean; card: boolean; crypto: boolean } {
  const card = stripeConfigured();
  const crypto = enabledNetworks(process.env as Record<string, string | undefined>).length > 0;
  const closed = String(process.env.PAYMENTS_OPEN ?? '').trim().toLowerCase() === 'false';
  return { open: (card || crypto) && !closed, card, crypto };
}
