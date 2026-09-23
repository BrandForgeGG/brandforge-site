import { NextRequest, NextResponse } from 'next/server';
import { getPlatformCounts, isStaffAccount } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Platform counters for the rail: registered accounts and BrandForge staff accounts, plus whether
// the caller is staff (the rail needs that to label presence and show the new-chats badge).
//
// "Online" is deliberately not here: it is real Realtime presence measured in the browser, not a
// number we could read from rows without inventing one.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const [counts, isStaff] = await Promise.all([getPlatformCounts(), isStaffAccount(user.id)]);

    return NextResponse.json({
      stats: { registered: counts.registered, staff: counts.staff },
      isStaff,
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
