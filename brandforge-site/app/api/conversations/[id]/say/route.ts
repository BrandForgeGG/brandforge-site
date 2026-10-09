import { after, NextRequest, NextResponse } from 'next/server';
import { readChatSilently } from '@/lib/silent-reader';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { addMessage, canAccessConversation, getConversationOwnerSession, getProfileDisplayName, isConversationAiEnabled, runAsGuestSession } from '@/lib/project-db';
import { resolveGuestSession } from '@/lib/guest-session';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST { message }: a person speaks in the chat without asking the AI anything. Used when the AI is paused (the
// owner can talk normally to the team and everyone else) and by teammates who have not been allowed to use the
// AI. Works for signed-in people and for the guest session that owns the chat.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  const guest = user ? null : await resolveGuestSession(request).catch(() => null);
  if (!user && !guest) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid chat' }, { status: 400 });

  if (user) {
    if (!(await canAccessConversation(user.id, id))) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  } else if (guest) {
    if ((await getConversationOwnerSession(id)) !== guest.sessionId) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const rate = checkRateLimit(`say:${user?.id ?? guest?.sessionId}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many messages. Try again later.' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { message?: unknown };
  const message = String(body.message ?? '').trim().slice(0, 8000);
  if (!message) return NextResponse.json({ error: 'Write a message first.' }, { status: 400 });
  const screened = screenText(message);
  if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });

  const write = async () =>
    addMessage({
      conversation_id: id,
      sender_type: 'user',
      sender_id: user?.id ?? null,
      sender_name: user ? await getProfileDisplayName(user.id) : 'Guest',
      content: message,
      content_type: 'text',
    });
  const messageId = guest ? await runAsGuestSession(guest.sessionId, write) : await write();
  if (!messageId) return NextResponse.json({ error: 'Your message could not be sent.' }, { status: 500 });
  // With the AI paused it does not answer, but it still reads this to keep the project panel up to date.
  if (!(await isConversationAiEnabled(id))) {
    after(async () => {
      const read = () => readChatSilently(id, { ownerId: user?.id, guest: Boolean(guest) });
      await (guest ? runAsGuestSession(guest.sessionId, read) : read()).catch(() => 0);
    });
  }
  return NextResponse.json({ messageId });
}
