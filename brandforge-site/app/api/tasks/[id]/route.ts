import { after, NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { addSystemLine, addTeammateParticipant, getAgreementById, getConversation, getProfileDisplayName, getTaskCard, isStaffAccount, recordFunnelEvent, setTaskAgreed, updateAgreementStatus, updateTaskCard } from '@/lib/project-db';
import { answerTask, type TaskState } from '@/lib/task-offer.js';
import { notifyFounder, notifyTeamChatOpened } from '@/lib/stage-notify';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const euros = (n: number) => `€${n.toLocaleString('en-US')}`;
const PAID = ['funded', 'active', 'completed'];

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
  const a = card.artifact;
  // Before payment the card's own status counts; after it, only the stages that follow payment.
  const paid = PAID.includes(String(agreement.status));
  const cardStatus = String(a.status ?? 'open');
  const status = (paid ? (['review', 'delivered'].includes(cardStatus) ? cardStatus : agreement.status === 'completed' ? 'delivered' : 'funded') : ['open', 'countered', 'accepted'].includes(cardStatus) ? cardStatus : 'open') as TaskState['status'];
  const state: TaskState = {
    status,
    amount: Number(a.amount ?? agreement.total_amount),
    ...(typeof a.counterAmount === 'number' ? { counterAmount: a.counterAmount, counterNote: String(a.counterNote ?? '') } : {}),
    ...(a.reviewNote || a.reviewLink ? { reviewNote: String(a.reviewNote ?? ''), reviewLink: String(a.reviewLink ?? '') } : {}),
    ...(a.changesNote ? { changesNote: String(a.changesNote) } : {}),
  };
  return { user, agreement, card, role: (buyer ? 'buyer' : 'team') as 'buyer' | 'team', state, offer: Boolean(a.offer) } as const;
}

// GET: the task's live state for its card (buyer or team).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const loaded = await load(request, (await params).id);
  if ('error' in loaded) return loaded.error;
  return NextResponse.json({ role: loaded.role, offer: loaded.offer, ...loaded.state }, { headers: { 'Cache-Control': 'private, no-store' } });
}

// POST { action, amount?, note?, link? }: one move on the task, by the team or the buyer (rules in lib/task-offer.js).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const loaded = await load(request, (await params).id);
  if ('error' in loaded) return loaded.error;
  const { user, agreement, card, role, state, offer } = loaded;
  if (!checkRateLimit(`task-answer:${user.id}`, { limit: 40, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Too many answers. Try again later.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; amount?: unknown; note?: unknown; link?: unknown };
  const result = answerTask(state, String(body.action ?? ''), { amount: body.amount, note: body.note, link: body.link }, role);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const next = result.state;
  const who = await getProfileDisplayName(user.id).catch(() => (role === 'team' ? 'The team' : 'The buyer'));
  const title = String(card.artifact.title ?? 'the task');

  // The card keeps who is on it; each move adds what it changed.
  const artifact: Record<string, unknown> = { ...card.artifact, status: next.status, amount: next.amount };
  for (const key of ['counterAmount', 'counterNote', 'reviewNote', 'reviewLink', 'changesNote']) delete artifact[key];
  if (next.status === 'countered') Object.assign(artifact, { counterAmount: next.counterAmount, counterNote: next.counterNote, counterBy: user.id, counterByName: who });
  if (next.status === 'review') Object.assign(artifact, { reviewNote: next.reviewNote, reviewLink: next.reviewLink });
  if (next.status === 'funded' && next.changesNote) Object.assign(artifact, { changesNote: next.changesNote });
  if (next.status === 'accepted') {
    // The teammate who accepted (or whose price was accepted) becomes the specialist on the project.
    const specialistId = role === 'team' ? user.id : String(card.artifact.counterBy ?? '');
    const specialistName = role === 'team' ? who : String(card.artifact.counterByName ?? 'The team');
    Object.assign(artifact, { acceptedBy: specialistId || null, acceptedByName: specialistName });
    if (!(await setTaskAgreed(agreement.id, next.amount))) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 502 });
    if (specialistId) await addTeammateParticipant(card.conversationId, specialistId, specialistName);
  }
  if (next.status === 'review' && agreement.status === 'funded') await updateAgreementStatus(agreement.id, 'active');
  if (next.status === 'delivered') await updateAgreementStatus(agreement.id, 'completed');
  if (!(await updateTaskCard(card.messageId, artifact))) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 502 });

  const line =
    next.status === 'accepted'
      ? role === 'team'
        ? `${who} accepted ${title} at ${euros(next.amount)}. Fund it to start.`
        : `Agreed: ${title} at ${euros(next.amount)}. Fund it to start.`
      : next.status === 'countered'
        ? `${who} proposed ${euros(next.counterAmount ?? 0)} for ${title}${next.counterNote ? `: ${next.counterNote}` : '.'}`
        : next.status === 'open'
          ? offer
            ? `The buyer declined the offer for ${title}. Talk it through here.`
            : `The buyer declined the price for ${title}. The task is open again.`
          : next.status === 'review'
            ? `${who} sent ${title} for review.${next.reviewNote ? ` ${next.reviewNote}` : ''}`
            : next.status === 'delivered'
              ? `Approved: ${title} is delivered. ${euros(next.amount)} is released to the team.`
              : `The buyer asked for changes on ${title}: ${next.changesNote}`;
  await addSystemLine(card.conversationId, line);
  after(async () => {
    if (role === 'team') await notifyFounder(card.conversationId, 'task_answered', { title, line });
    else await notifyTeamChatOpened({ conversationId: card.conversationId, who: `${title}: ${next.status === 'delivered' ? 'approved' : next.status === 'funded' ? 'changes asked' : next.status === 'accepted' ? 'agreed' : 'reopened'}`, message: line, openerId: user.id, again: true });
    if (next.status === 'delivered') await recordFunnelEvent('payment_released', { signedIn: true, properties: { source: 'task', total_amount: next.amount } }).catch(() => undefined);
  });
  return NextResponse.json({ role, offer, ...next });
}
