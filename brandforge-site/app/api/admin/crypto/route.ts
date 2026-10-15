import { NextRequest, NextResponse } from 'next/server';
import { isAdminAccount, listCryptoInvoices } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { assetOf, chainOf } from '@/lib/crypto-chains.js';

export const dynamic = 'force-dynamic';

// GET /api/admin/crypto: the latest crypto payments (paid and still open), for staff to match against the wallet.
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isAdminAccount(user.id))) return NextResponse.json({ error: 'Admin access only' }, { status: 403 });
  const rows = await listCryptoInvoices(40);
  return NextResponse.json({
    payments: rows.map((row) => {
      const asset = assetOf(row.network);
      const chain = chainOf(asset);
      return {
        id: row.id,
        name: row.name,
        purpose: row.purpose,
        ref: row.ref_id,
        amount: `${row.amount} ${asset?.coin ?? ''}`.trim(),
        network: asset && chain ? `${asset.coin} · ${chain.name}` : row.network,
        price: { cents: row.price_cents, currency: row.currency },
        status: row.status === 'open' && Date.parse(row.expires_at) < Date.now() ? 'expired' : row.status,
        txUrl: row.tx_hash && chain ? `${chain.explorer}${row.tx_hash}` : null,
        createdAt: row.created_at,
        paidAt: row.paid_at,
      };
    }),
  });
}
