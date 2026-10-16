import { getRetainer } from '@/lib/plans.js';
import { getProfileDisplayName, openTeamPlanChat } from '@/lib/project-db';
import { notifyTeamChatOpened } from '@/lib/stage-notify';

// After a team plan is paid (card or crypto): the buyer gets their team chat, and the whole team hears about it on every
// channel (Discord ops, each staff member's Telegram and email). Software plans (Pro) open nothing. Best-effort, never throws.
export async function startTeamPlan(userId: string | null, planId: string | null, via: 'card' | 'crypto'): Promise<string | null> {
  const plan = planId ? getRetainer(planId) : null;
  if (!plan || !userId) return null;
  try {
    const welcome = `Payment received for ${plan.name} (${plan.price}${plan.cadence}). Your team joins this chat shortly. To start, send your website, your channels and what you want first.`;
    const chat = await openTeamPlanChat(userId, `${plan.name} team plan`, welcome);
    if (!chat) return null;
    if (chat.created) {
      const who = await getProfileDisplayName(userId).catch(() => 'A client');
      await notifyTeamChatOpened({ conversationId: chat.id, who: `PAID ${plan.name} ${plan.price}${plan.cadence} (${via}): ${who}`, message: 'New team plan client. Claim the chat and say hello.', openerId: userId });
    }
    return chat.id;
  } catch (cause) {
    console.error('startTeamPlan failed:', cause instanceof Error ? cause.message : cause);
    return null;
  }
}
