import { NextResponse } from 'next/server';
import { stripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Whether card payment is switched on. The pricing page shows "Pay by card" only when it is.
export async function GET() {
  return NextResponse.json({ checkout: stripeConfigured() });
}
