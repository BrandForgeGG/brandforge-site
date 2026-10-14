import { NextResponse } from 'next/server';
import { getActivityRows } from '@/lib/project-db';
import { buildActivity, type ActivityRow } from '@/lib/activity-feed.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: "Happening now" for Explore. Everything people do, in public-safe words: new members, new chats, new carousels,
// shares, published posts, Trade listings, applications to the team and signed contracts. Only real people count.
export async function GET() {
  const rows = (await getActivityRows(12)) as Partial<Record<string, ActivityRow[]>>;
  return NextResponse.json({ items: buildActivity(rows, 30) }, { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60' } });
}
