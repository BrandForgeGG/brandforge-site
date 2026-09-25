import { NextRequest, NextResponse } from 'next/server';
import { canAccessConversation, getParticipantIdentity } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const conversationId = request.nextUrl.searchParams.get('conversationId') ?? '';
  const userId = request.nextUrl.searchParams.get('userId') ?? '';
  if (!conversationId || !userId) return NextResponse.json({ error: 'conversationId and userId are required' }, { status: 400 });
  if (!(await canAccessConversation(user.id, conversationId, { allowStaff: true }))) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const identity = await getParticipantIdentity(conversationId, userId);
  if (!identity) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  const { email: _email, telegramChatId: _telegramChatId, ...publicIdentity } = identity;
  return NextResponse.json({ identity: publicIdentity });
}
