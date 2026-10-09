import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { setConversationAiEnabled } from '@/lib/project-db';
import { resolveGuestSession } from '@/lib/guest-session';

export const dynamic = 'force-dynamic';

// PATCH { aiEnabled }: the chat owner (signed in, or the guest session that started it) pauses or resumes the
// AI. The request is passed to the sign-in check so a freshly refreshed session counts, and guests can pause
// their own chat too.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  const guest = user ? null : await resolveGuestSession(request).catch(() => null);
  if (!user && !guest) return NextResponse.json({ error: 'Sign in to pause the AI.' }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid chat' }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { aiEnabled?: unknown };
  if (typeof body.aiEnabled !== 'boolean') return NextResponse.json({ error: 'aiEnabled must be true or false' }, { status: 400 });

  const result = await setConversationAiEnabled(id, { userId: user?.id, guestSessionId: guest?.sessionId }, body.aiEnabled);
  if (result === 'not_found') return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  if (result === 'forbidden') return NextResponse.json({ error: 'Only the chat owner can do that.' }, { status: 403 });
  if (result === 'failed') return NextResponse.json({ error: 'Could not update the chat. Try again.' }, { status: 500 });
  return NextResponse.json({ success: true, aiEnabled: body.aiEnabled });
}
