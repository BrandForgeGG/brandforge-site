import { NextResponse } from 'next/server';
import { NETWORKS } from '@/lib/crypto-chains.js';
import { cryptoNetworks } from '@/lib/crypto-service';

export const dynamic = 'force-dynamic';

// The networks members can pay on right now: each one is on once its receiving address is set.
export async function GET() {
  const networks = cryptoNetworks().map((id) => {
    const n = NETWORKS[id];
    return { id: n.id, label: n.label, short: n.short, symbol: n.symbol, feeNote: n.feeNote };
  });
  return NextResponse.json({ networks }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
