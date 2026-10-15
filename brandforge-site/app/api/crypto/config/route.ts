import { NextResponse } from 'next/server';
import { publicAsset } from '@/lib/crypto-chains.js';
import { cryptoAssets } from '@/lib/crypto-service';

export const dynamic = 'force-dynamic';

// The coins members can pay with right now: each chain is on once its receiving address is set.
export async function GET() {
  return NextResponse.json({ assets: cryptoAssets().map((id) => publicAsset(id)) }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
