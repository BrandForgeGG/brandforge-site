import { NextRequest, NextResponse } from 'next/server';
import { canAccessConversation, isStaffAccount } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import {
  buildClientState,
  getConversationSnapshot,
  syncDiscoveryCompleteness,
} from '@/lib/conversation-state';

export const dynamic = 'force-dynamic';

// Everything the right sidebar renders, read straight from persisted rows.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const conversationId = String(request.nextUrl.searchParams.get('conversationId') ?? '').trim();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const [isStaff, hasAccess] = await Promise.all([
      isStaffAccount(user.id),
      canAccessConversation(user.id, conversationId, { allowStaff: true }),
    ]);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const snapshot = await getConversationSnapshot(conversationId, { asStaff: isStaff });

    if (!snapshot) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Discovery progress is recomputed on load as well, so a stale stored value self-heals.
    // Staff views never write: the panel is a read of the founder's rows.
    const discovery = await syncDiscoveryCompleteness(conversationId, { asStaff: isStaff });

    return NextResponse.json({ state: buildClientState(snapshot, discovery) });
  } catch (error) {
    console.error('Project context API error:', error);
    return NextResponse.json({ error: 'Failed to fetch project context' }, { status: 500 });
  }
}
