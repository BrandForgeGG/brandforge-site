import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { touchLastSeen } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

// POST: the signed-in person is active (the sidebar sends this at most every few minutes). Feeds "seen x ago".
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  await touchLastSeen(user.id);
  return NextResponse.json({ ok: true });
}
