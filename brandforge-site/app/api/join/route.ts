import { NextRequest, NextResponse } from 'next/server';
import { getActorName, getAuthenticatedUser } from '@/lib/supabase-server';
import { joinConversationAsMember } from '@/lib/project-db';
import { blueprintConfig } from '@/lib/blueprint-config';
import { verifyJoinToken } from '@/lib/join-token';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST /api/join { token } — redeem a team invite link. Signed-in only: the
// token proves the invite, the session proves who is joining.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rate = checkRateLimit(`join:${user.id}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many attempts — try again later.' }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const conversationId = verifyJoinToken(body.token, blueprintConfig().sessionSecret);
  if (!conversationId) {
    return NextResponse.json({ error: 'This invite link is invalid or has expired.' }, { status: 400 });
  }

  const joined = await joinConversationAsMember(conversationId, user.id, getActorName(user));
  if (!joined.ok) {
    return NextResponse.json(
      { error: joined.error === 'not_found' ? 'That chat no longer exists.' : 'Could not join the chat.' },
      { status: joined.error === 'not_found' ? 404 : 500 },
    );
  }
  return NextResponse.json({ conversationId, already: joined.already });
}
