import { NextRequest, NextResponse } from 'next/server';
import { listPeerContractsWithPendingWork } from '@/lib/project-db';
import { settleIfDue } from '@/lib/peer-contract-service';

export const dynamic = 'force-dynamic';

// Daily: release every submitted milestone whose 48 hours passed with no objection, so the
// money never waits on someone opening the chat.
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
    if ((request.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await listPeerContractsWithPendingWork();
    let released = 0;
    for (const row of rows) {
      const before = row.updated_at;
      const after = await settleIfDue(row);
      if (after.updated_at !== before) released += 1;
    }
    return NextResponse.json({ checked: rows.length, settled: released });
  } catch (error) {
    console.error('Cron peer-contracts error:', error);
    return NextResponse.json({ error: 'Cron run failed' }, { status: 500 });
  }
}
