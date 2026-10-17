import { after, NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { addMessage, createAgreement, createConversation, getConversation, getProfileDisplayName, isStaffAccount, recordFunnelEvent } from '@/lib/project-db';
import { checkCustomTask } from '@/lib/custom-task.js';
import { screenText } from '@/lib/content-policy.js';
import { notifyFounder, notifyTeamChatOpened } from '@/lib/stage-notify';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST { title, details, funds, chatId? }: a task with its funds, as a card in a chat. A chat holds as many tasks as needed.
// - A buyer without chatId: a new chat for the task (from Projects, the pricing card or the homepage).
// - A buyer with chatId (their own chat): the task joins that chat. The team accepts it or proposes a price.
// - A teammate with chatId (a client's chat): an offer from the team. The price waits for the buyer to accept.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in to set up a task.', code: 'auth' }, { status: 401 });
  if (!checkRateLimit(`custom-task:${user.id}`, { limit: 20, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Too many tasks at once. Try again later.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkCustomTask(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { title, details, funds } = checked.task;
  const screened = screenText(`${title}\n${details}`);
  if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });
  const who = await getProfileDisplayName(user.id).catch(() => 'Someone');

  let chatId: string | null = null;
  let offer = false;
  const asked = typeof body.chatId === 'string' && /^[0-9a-f-]{36}$/i.test(body.chatId) ? body.chatId : null;
  if (asked) {
    const chat = await getConversation(asked);
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    if (chat.user_id === user.id) chatId = asked;
    else if (await isStaffAccount(user.id)) {
      chatId = asked;
      offer = true;
    } else return NextResponse.json({ error: 'Not your chat.' }, { status: 403 });
  } else {
    chatId = await createConversation(user.id, title);
    if (!chatId) return NextResponse.json({ error: 'Could not set up the task. Try again.' }, { status: 502 });
  }

  await addMessage({ conversation_id: chatId, sender_type: offer ? 'human_operator' : 'user', sender_id: user.id, sender_name: who, content: `${title}\n\n${details}` });
  const agreement = await createAgreement({ conversation_id: chatId, proposal_id: null, terms: details, total_amount: funds, currency: 'EUR' });
  if (!agreement?.id) return NextResponse.json({ error: 'Could not set up the funds. Try again.' }, { status: 502 });
  const euros = `€${funds.toLocaleString('en-US')}`;
  await addMessage({
    conversation_id: chatId,
    sender_type: 'human_operator',
    sender_name: 'BrandForge',
    content: offer ? `Offer: ${title}, ${euros}. Accept it to fund and start.` : `Task: ${title}, ${euros}. The team accepts it or proposes a price.`,
    content_type: 'system',
    artifact_data: offer
      ? { type: 'task_fund', id: agreement.id, status: 'countered', title, amount: funds, counterAmount: funds, counterNote: '', counterBy: user.id, counterByName: who, offer: true }
      : { type: 'task_fund', id: agreement.id, status: 'open', title, amount: funds },
  });
  after(async () => {
    if (offer) await notifyFounder(chatId as string, 'task_answered', { title, line: `${who} sent you an offer: ${title}, ${euros}.` });
    else await notifyTeamChatOpened({ conversationId: chatId as string, who: `New task ${euros}: ${who}`, message: title, openerId: user.id, again: true });
    await recordFunnelEvent('custom_task_created', { signedIn: true, properties: { source: offer ? 'team_offer' : asked ? 'chat' : 'custom', total_amount: funds } });
  });
  return NextResponse.json({ chatId, agreementId: agreement.id });
}
