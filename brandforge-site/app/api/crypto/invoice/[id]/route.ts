import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCryptoInvoice, getProfileDisplayName } from '@/lib/project-db';
import { checkInvoice, invoiceView, watchInvoice } from '@/lib/crypto-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

async function own(request: NextRequest, id: string) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: 'Sign in to see this payment.' }, { status: 401 }) } as const;
  const row = await getCryptoInvoice(id);
  if (!row || row.user_id !== user.id) return { error: NextResponse.json({ error: 'Payment not found.' }, { status: 404 }) } as const;
  return { user, row } as const;
}

// GET -> { invoice }. With ?watch=1 (and the cursor from the last answer), also looks on-chain for this invoice's exact
// amount, so the checkout updates by itself when the payment lands.
export async function GET(request: NextRequest, { params }: Ctx) {
  const found = await own(request, (await params).id);
  if ('error' in found) return found.error;
  const url = new URL(request.url);
  if (url.searchParams.get('watch') !== '1') return NextResponse.json({ invoice: invoiceView(found.row) });
  if (!checkRateLimit(`crypto-watch:${found.user.id}`, { limit: 600, windowMs: 3_600_000 }).allowed) {
    return NextResponse.json({ status: 'waiting', note: 'Waiting for your payment.', cursor: null });
  }
  const raw = Number(url.searchParams.get('cursor'));
  const cursor = Number.isFinite(raw) && raw > 0 ? raw : null;
  try {
    return NextResponse.json(await watchInvoice(found.row, found.user.id, await getProfileDisplayName(found.user.id), cursor, found.user.email ?? null));
  } catch (error) {
    console.warn('[crypto] watch failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ status: 'waiting', note: 'Waiting for your payment.', cursor });
  }
}

// POST { txHash } -> { status, note }. Reads the transaction on its chain; when it pays this invoice in full and is
// confirmed, what was bought is delivered right away.
export async function POST(request: NextRequest, { params }: Ctx) {
  const found = await own(request, (await params).id);
  if ('error' in found) return found.error;
  if (!checkRateLimit(`crypto-check:${found.user.id}`, { limit: 60, windowMs: 3_600_000 }).allowed) {
    return NextResponse.json({ error: 'Too many checks. Wait a minute and try again.' }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as { txHash?: unknown };
  try {
    const result = await checkInvoice(found.row, String(body.txHash ?? ''), found.user.id, await getProfileDisplayName(found.user.id), found.user.email ?? null);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[crypto] check failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ status: 'missing', note: 'The network could not be reached just now. Try again in a moment.' });
  }
}
