import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { addMessage, canAccessConversation, getProfileDisplayName } from '@/lib/project-db';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST { message }: a person speaks to the others in a shared chat without asking the AI anything. Used by
// teammates who have not been allowed to use the AI, so they are never locked out of the conversation.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid chat' }, { status: 400 });
  if (!(await canAccessConversation(user.id, id))) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const rate = checkRateLimit(`say:${user.id}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many messages. Try again later.' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { message?: unknown };
  const message = String(body.message ?? '').trim().slice(0, 8000);
  if (!message) return NextResponse.json({ error: 'Write a message first.' }, { status: 400 });
  const screened = screenText(message);
  if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });

  const messageId = await addMessage({ conversation_id: id, sender_type: 'user', sender_id: user.id, sender_name: await getProfileDisplayName(user.id), content: message, content_type: 'text' });
  if (!messageId) return NextResponse.json({ error: 'Your message could not be sent.' }, { status: 500 });
  return NextResponse.json({ messageId });
}
