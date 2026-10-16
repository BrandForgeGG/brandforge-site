import { after, NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { addMessage, createAgreement, createConversation, getProfileDisplayName, recordFunnelEvent } from '@/lib/project-db';
import { checkCustomTask } from '@/lib/custom-task.js';
import { screenText } from '@/lib/content-policy.js';
import { notifyTeamChatOpened } from '@/lib/stage-notify';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST { title, details, funds }: a buyer sets up a custom task with its funds. It gets its own chat (the work and the
// talk live there), an agreement for the funds, and a card to fund it by card or crypto. The whole team is called.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in to set up a task.', code: 'auth' }, { status: 401 });
  if (!checkRateLimit(`custom-task:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Too many tasks at once. Try again later.' }, { status: 429 });
  const checked = checkCustomTask((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { title, details, funds } = checked.task;
  const screened = screenText(`${title}\n${details}`);
  if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });

  const chatId = await createConversation(user.id, title);
  if (!chatId) return NextResponse.json({ error: 'Could not set up the task. Try again.' }, { status: 502 });
  const who = await getProfileDisplayName(user.id).catch(() => 'A buyer');
  await addMessage({ conversation_id: chatId, sender_type: 'user', sender_id: user.id, sender_name: who, content: `${title}\n\n${details}` });
  const agreement = await createAgreement({ conversation_id: chatId, proposal_id: null, terms: details, total_amount: funds, currency: 'EUR' });
  if (!agreement?.id) return NextResponse.json({ error: 'Could not set up the funds. Try again.' }, { status: 502 });
  await addMessage({
    conversation_id: chatId,
    sender_type: 'human_operator',
    sender_name: 'BrandForge',
    content: `Task: ${title}, €${funds.toLocaleString('en-US')}. Fund it to start.`,
    content_type: 'system',
    artifact_data: { type: 'task_fund', id: agreement.id, status: 'open', title, amount: funds },
  });
  after(async () => {
    await notifyTeamChatOpened({ conversationId: chatId, who: `New task €${funds.toLocaleString('en-US')}: ${who}`, message: title, openerId: user.id, again: true });
    await recordFunnelEvent('custom_task_created', { signedIn: true, properties: { source: 'custom', total_amount: funds } });
  });
  return NextResponse.json({ chatId, agreementId: agreement.id });
}
