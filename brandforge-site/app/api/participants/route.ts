import { NextRequest, NextResponse } from 'next/server';
import {
  canAccessConversation,
  getParticipants,
  getAvatarUrls,
  isStaffAccount,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// NOTE: this route is read-only by design. Participant writes happen only through
// server-side flows with fixed roles (staff join, admin invite, proposal-accept
// invite). A generic POST here once let any participant add any user under any
// role string — it had zero legitimate callers, so it was removed (audit, C69).

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    const [isStaff, hasAccess] = await Promise.all([
      isStaffAccount(user.id),
      canAccessConversation(user.id, conversationId, { allowStaff: true }),
    ]);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const participants = await getParticipants(conversationId, isStaff);

    const faces = await getAvatarUrls(participants.map((p) => String(p.user_id ?? '')));
    return NextResponse.json({
      participants: participants.map((p) => ({ ...p, avatar_url: faces.get(String(p.user_id ?? '')) ?? null })),
    });
  } catch (error) {
    console.error('Get participants API error:', error);
    return NextResponse.json(
      { error: 'Failed to get participants' },
      { status: 500 }
    );
  }
}
