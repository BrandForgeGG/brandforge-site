import { NextRequest, NextResponse } from 'next/server';
import {
  addParticipant,
  canAccessConversation,
  getParticipants,
  isStaffAccount,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, userId, role, displayName } = body;

    if (!conversationId || !userId || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const hasAccess = await canAccessConversation(user.id, conversationId);
    
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const participant = await addParticipant({
      conversation_id: conversationId,
      user_id: userId,
      role,
      display_name: displayName,
    });

    if (!participant) {
      return NextResponse.json({ error: 'Failed to add participant' }, { status: 500 });
    }

    return NextResponse.json({ success: true, participant });
  } catch (error) {
    console.error('Add participant API error:', error);
    return NextResponse.json(
      { error: 'Failed to add participant' },
      { status: 500 }
    );
  }
}

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

    const isStaff = await isStaffAccount(user.id);
    const hasAccess = await canAccessConversation(user.id, conversationId, { allowStaff: true });
    
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const participants = await getParticipants(conversationId, isStaff);

    return NextResponse.json({ participants });
  } catch (error) {
    console.error('Get participants API error:', error);
    return NextResponse.json(
      { error: 'Failed to get participants' },
      { status: 500 }
    );
  }
}
