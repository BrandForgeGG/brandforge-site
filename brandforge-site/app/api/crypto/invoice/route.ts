import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { openInvoice, type Purpose } from '@/lib/crypto-service';

export const dynamic = 'force-dynamic';

const PURPOSES = new Set<Purpose>(['plan', 'agreement', 'peer', 'test']);

// POST { purpose, refId, network } -> { invoice, title }. The server prices the payment from the plan, the agreement or
// the contract itself, so the amount can never come from the browser.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in to pay.' }, { status: 401 });
  if (!checkRateLimit(`crypto-invoice:${user.id}`, { limit: 30, windowMs: 3_600_000 }).allowed) {
    return NextResponse.json({ error: 'Too many payment attempts. Try again later.' }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as { purpose?: unknown; refId?: unknown; network?: unknown };
  const purpose = String(body.purpose ?? '') as Purpose;
  const refId = String(body.refId ?? '').trim().slice(0, 100);
  if (!PURPOSES.has(purpose) || !refId) return NextResponse.json({ error: 'Missing what to pay for.' }, { status: 400 });
  const opened = await openInvoice(user.id, purpose, refId, String(body.network ?? ''));
  if (!opened.ok) return NextResponse.json({ error: opened.error }, { status: opened.status });
  return NextResponse.json({ invoice: opened.invoice, title: opened.title });
}
