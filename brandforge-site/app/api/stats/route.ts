import { NextRequest, NextResponse } from 'next/server';
import { isStaffAccount, isAdminAccount } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Access flags for the rail: whether the caller is staff (presence labels, new-chats
// badge) and whether admin links apply. Platform-wide counters used to live here but
// nothing renders them anymore, so the route no longer scans the profiles table on
// every 60-second poll — flags only.
//
// isAdmin comes from profiles.role, which is the authoritative source — the rail must not decide
// admin access from an email allowlist, or a promoted admin would see no admin links.
//
// "Online" is deliberately not here: it is real Realtime presence measured in the browser, not a
// number we could read from rows without inventing one.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const [isStaff, isAdmin] = await Promise.all([
      isStaffAccount(user.id),
      isAdminAccount(user.id),
    ]);

    return NextResponse.json({ isStaff, isAdmin });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
