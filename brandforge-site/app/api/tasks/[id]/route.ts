import { after, NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { addSystemLine, addTeammateParticipant, getAgreementById, getConversation, getProfileDisplayName, getTaskCard, isStaffAccount, setTaskAgreed, updateTaskCard } from '@/lib/project-db';
import { answerTask, type TaskState } from '@/lib/task-offer.js';
import { notifyFounder, notifyTeamChatOpened } from '@/lib/stage-notify';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const euros = (n: number) => `€${n.toLocaleString('en-US')}`;

async function load(request: NextRequest, id: string) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: 'Sign in first.' }, { status: 401 }) } as const;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: NextResponse.json({ error: 'Invalid task' }, { status: 400 }) } as const;
  const [agreement, card] = await Promise.all([getAgreementById(id), getTaskCard(id)]);
  if (!agreement || !card) return { error: NextResponse.json({ error: 'Task not found' }, { status: 404 }) } as const;
  const chat = await getConversation(card.conversationId);
  const buyer = Boolean(chat && chat.user_id === user.id);
  const team = !buyer && (await isStaffAccount(user.id));
  if (!buyer && !team) return { error: NextResponse.json({ error: 'Not your task.' }, { status: 403 }) } as const;
  const funded = ['funded', 'active', 'completed'].includes(String(agreement.status));
  const state: TaskState = {
    status: funded ? 'funded' : ((['open', 'countered', 'accepted'].includes(String(card.artifact.status)) ? card.artifact.status : 'open') as TaskState['status']),
    amount: Number(card.artifact.amount ?? agreement.total_amount),
    ...(typeof card.artifact.counterAmount === 'number' ? { counterAmount: card.artifact.counterAmount, counterNote: String(card.artifact.counterNote ?? '') } : {}),
  };
  return { user, agreement, card, chat, role: (buyer ? 'buyer' : 'team') as 'buyer' | 'team', state } as const;
}

// GET: the task's live state for its card (buyer or team).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const loaded = await load(request, (await params).id);
  if ('error' in loaded) return loaded.error;
  return NextResponse.json({ role: loaded.role, ...loaded.state }, { headers: { 'Cache-Control': 'private, no-store' } });
}

// POST { action, amount?, note? }: the team accepts or counters; the buyer accepts or declines a counter.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const loaded = await load(request, (await params).id);
  if ('error' in loaded) return loaded.error;
  const { user, agreement, card, role, state } = loaded;
  if (!checkRateLimit(`task-answer:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Too many answers. Try again later.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; amount?: unknown; note?: unknown };
  const result = answerTask(state, String(body.action ?? ''), { amount: body.amount, note: body.note }, role);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const next = result.state;
  const who = await getProfileDisplayName(user.id).catch(() => (role === 'team' ? 'The team' : 'The buyer'));
  const title = String(card.artifact.title ?? 'the task');

  const artifact: Record<string, unknown> = { type: 'task_fund', id: agreement.id, title: card.artifact.title, amount: next.amount, status: next.status };
  if (next.status === 'countered') Object.assign(artifact, { counterAmount: next.counterAmount, counterNote: next.counterNote, counterBy: user.id, counterByName: who });
  if (next.status === 'accepted') {
    // The teammate who accepted (or whose counter was accepted) becomes the specialist on the project.
    const specialistId = role === 'team' ? user.id : String(card.artifact.counterBy ?? '');
    const specialistName = role === 'team' ? who : String(card.artifact.counterByName ?? 'The team');
    Object.assign(artifact, { acceptedBy: specialistId || null, acceptedByName: specialistName });
    if (!(await setTaskAgreed(agreement.id, next.amount))) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 502 });
    if (specialistId) await addTeammateParticipant(card.conversationId, specialistId, specialistName);
  }
  if (!(await updateTaskCard(card.messageId, artifact))) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 502 });

  const line =
    next.status === 'accepted'
      ? role === 'team'
        ? `${who} accepted the task at ${euros(next.amount)}. Fund it to start.`
        : `The buyer accepted the counter: ${euros(next.amount)}. Fund it to start.`
      : next.status === 'countered'
        ? `${who} countered at ${euros(next.counterAmount ?? 0)}${next.counterNote ? `: ${next.counterNote}` : '.'}`
        : 'The buyer declined the counter. The task is open again.';
  await addSystemLine(card.conversationId, line);
  after(async () => {
    if (role === 'team') await notifyFounder(card.conversationId, 'task_answered', { title, line });
    else await notifyTeamChatOpened({ conversationId: card.conversationId, who: `Task ${next.status === 'accepted' ? 'agreed' : 'reopened'}: ${title}`, message: line, openerId: user.id, again: true });
  });
  return NextResponse.json({ role, ...next });
}
