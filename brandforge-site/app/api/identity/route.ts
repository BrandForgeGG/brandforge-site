import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { getMyIdentity, updateMyUsername } from '@/lib/project-db';
import { validateUsername } from '@/lib/identity';

export const dynamic = 'force-dynamic';

// The signed-in member's own identity row: public number, handle, role, and Telegram link state.
// This is the only route that returns a member's own email, so it is scoped strictly to the
// caller and never accepts a user id from the request.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const identity = await getMyIdentity(user.id);

    if (!identity) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ identity });
  } catch (error) {
    console.error('Identity API error:', error);
    return NextResponse.json({ error: 'Failed to load identity' }, { status: 500 });
  }
}

// Sets the caller's own username. Uniqueness is enforced twice on purpose: the pure validator
// rejects malformed handles before we touch the database, and the RLS policy added in migration
// 0009 re-checks it at the row level, so a race between two members picking the same handle
// still fails closed with a founder-readable message rather than a duplicate.
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { username?: unknown };
    const validation = validateUsername(body.username);

    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    const result = await updateMyUsername(user.id, validation.username);

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ identity: result.identity });
  } catch (error) {
    console.error('Username update error:', error);
    return NextResponse.json({ error: 'Failed to update username' }, { status: 500 });
  }
}