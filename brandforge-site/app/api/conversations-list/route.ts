import { NextRequest, NextResponse } from 'next/server';
import {
  getStaffConversationSummaries,
  getUserConversationSummaries,
  isStaffAccount,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// The rail's Recents feed.
//
// Founders see their own conversations. BrandForge staff see every conversation - a chat opened by
// a user already belongs to them, nobody has to join it by hand - plus how many of those chats
// nobody has picked up yet (drives the staff "new chats" badge). Only conversations with real
// messages are listed, so landing on /chat never creates a phantom entry.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const isStaff = await isStaffAccount(user.id);
    const conversations = isStaff
      ? await getStaffConversationSummaries()
      : await getUserConversationSummaries(user.id);
    const unseenCount = isStaff
      ? conversations.filter((conversation) => conversation.isUnseen).length
      : 0;

    return NextResponse.json({ conversations, isStaff, unseenCount });
  } catch (error) {
    console.error('Conversations list API error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}
