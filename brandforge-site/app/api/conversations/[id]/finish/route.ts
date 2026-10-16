import { after, NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { notifyTeamChatOpened } from '@/lib/stage-notify';
import { addMessage, getConversationForUser, getProfileDisplayName, recordFunnelEvent } from '@/lib/project-db';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST { note, kind }: the owner of a creation asks the BrandForge team to finish it. The note lands in the creation's own
// chat (so the work is already attached) and the whole team is called; the first person to claim the chat takes it.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid chat' }, { status: 400 });
  if (!(await getConversationForUser(user.id, id))) return NextResponse.json({ error: 'Only the owner can ask for this.' }, { status: 403 });
  if (!checkRateLimit(`finish:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { note?: unknown; kind?: unknown };
  const note = String(body.note ?? '').trim().slice(0, 2000);
  const kind = String(body.kind ?? 'creation').replace(/[^a-z]/g, '').slice(0, 20) || 'creation';
  if (note.length < 3) return NextResponse.json({ error: 'Add a short note for the team.' }, { status: 400 });
  const screened = screenText(note);
  if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });

  const who = await getProfileDisplayName(user.id).catch(() => 'A member');
  const messageId = await addMessage({ conversation_id: id, sender_type: 'user', sender_id: user.id, sender_name: who, content: `Team, please finish this ${kind}. ${note}` });
  if (!messageId) return NextResponse.json({ error: 'Could not send it. Try again.' }, { status: 502 });
  after(async () => {
    await notifyTeamChatOpened({ conversationId: id, who: `Finish this ${kind}: ${who}`, message: note, openerId: user.id, again: true });
    await recordFunnelEvent('team_finish_requested', { signedIn: true, properties: { source: kind } });
  });
  return NextResponse.json({ ok: true, messageId });
}
