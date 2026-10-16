import { getRetainer } from '@/lib/plans.js';
import { findOpenPlanInvoice, findPlanChat, getProfileDisplayName, markPlanInvoicePaid, openTeamPlanChat } from '@/lib/project-db';
import { notifyTeamChatOpened } from '@/lib/stage-notify';
import { startPlanMonth } from '@/lib/plan-month-start';

// Every payment for a team plan (card or crypto, first month or a renewal) lands here.
// - First month, the usual path: the buyer and the team agreed the plan in a chat and the team sent an invoice card there;
//   that card turns Paid and month 1 starts in the same chat.
// - A renewal: the next month starts in the chat where the plan already runs.
// - A payment with neither (bought straight from a link): it opens its own team chat.
// Each month adds its work list to the chat, and the whole team hears about it on every channel. Software plans (Pro) do
// nothing here. Best-effort, never throws.
export async function startTeamPlan(userId: string | null, planId: string | null, via: 'card' | 'crypto'): Promise<string | null> {
  const plan = planId ? getRetainer(planId) : null;
  if (!plan || !userId) return null;
  try {
    const who = await getProfileDisplayName(userId).catch(() => 'A client');
    const price = `${plan.name} ${plan.price}${plan.cadence}`;
    let chatId: string | null = null;
    const invoice = await findOpenPlanInvoice(userId, plan.id);
    if (invoice) {
      await markPlanInvoicePaid(invoice.messageId, plan.id);
      chatId = invoice.conversationId;
    } else {
      chatId = await findPlanChat(userId, plan.id, plan.name);
      if (!chatId) {
        const welcome = `Payment received for ${plan.name} (${plan.price}${plan.cadence}). Your team joins this chat shortly. To start, send your website, your channels and what you want first.`;
        chatId = (await openTeamPlanChat(userId, `${plan.name} team plan`, welcome))?.id ?? null;
      }
    }
    if (!chatId) return null;
    const month = await startPlanMonth(chatId, plan.id, (n) => (n === 1 ? `Paid: ${price}. Month 1 starts today.` : `Renewed: ${price}. Month ${n} starts today.`));
    if (month === 0) return chatId;
    await notifyTeamChatOpened({ conversationId: chatId, who: `PAID ${price} (${via}, month ${month}): ${who}`, message: `Month ${month} work list is in the chat.`, openerId: userId, again: true });
    return chatId;
  } catch (cause) {
    console.error('startTeamPlan failed:', cause instanceof Error ? cause.message : cause);
    return null;
  }
}

/** A team plan was cancelled: the team hears it in that client's chat, so someone can talk to them before the month ends. */
export async function teamPlanEnded(userId: string | null, planId: string | null): Promise<void> {
  const plan = planId ? getRetainer(planId) : null;
  if (!plan || !userId) return;
  try {
    const chatId = await findPlanChat(userId, plan.id, plan.name);
    if (!chatId) return;
    const who = await getProfileDisplayName(userId).catch(() => 'A client');
    await notifyTeamChatOpened({ conversationId: chatId, who: `CANCELLED ${plan.name}: ${who}`, message: 'Their plan was cancelled. Talk to them today: what would make them stay?', openerId: userId, again: true });
  } catch (cause) {
    console.error('teamPlanEnded failed:', cause instanceof Error ? cause.message : cause);
  }
}
