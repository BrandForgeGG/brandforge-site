import { NextResponse } from 'next/server';
import { paymentStatus } from '@/lib/payments-open';

export const dynamic = 'force-dynamic';

// Whether Pay now is open. It opens only when card and crypto payments are both connected; until then the buttons show
// as locked. `checkout` stays for older pages.
export async function GET() {
  const status = paymentStatus();
  return NextResponse.json({ checkout: status.open, ...status });
}