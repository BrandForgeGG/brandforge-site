import { notifyUser } from './notify';
import { sendStageEmail } from './email';
import { getFounderNotifyTargets, getMemberChatRecipients, getUserNotifyTargets } from './project-db';
import { resolveSiteUrl } from './auth-utils';

// A person wrote in a chat that other members are part of: tell each of them on the channels they have. A first
// contact (Hire on a listing) always goes out; ordinary follow-up messages go out at most once every ten minutes per
// chat and person, so a back-and-forth never becomes a flood. Best-effort, never throws.
const recentPings = new Map<string, number>();
const PING_GAP_MS = 10 * 60 * 1000;

export async function notifyChatMembers(
  conversationId: string,
  sender: { id: string; name: string },
  message: string,
  options: { event?: 'trade_contact' | 'chat_message'; title?: string; only?: string[] } = {}
): Promise<number> {
  const event = options.event ?? 'chat_message';
  try {
    const recipients = options.only ?? (await getMemberChatRecipients(conversationId, sender.id));
    const chatUrl = `${resolveSiteUrl()}/chat?conversationId=${encodeURIComponent(conversationId)}`;
    let sent = 0;
    for (const userId of recipients) {
      if (event === 'chat_message') {
        const key = `${conversationId}:${userId}`;
        const last = recentPings.get(key) ?? 0;
        if (Date.now() - last < PING_GAP_MS) continue;
        recentPings.set(key, Date.now());
        if (recentPings.size > 500) recentPings.clear();
      }
      const targets = await getUserNotifyTargets(userId);
      const details = { name: sender.name, title: options.title ?? '', message, chatUrl };
      if (targets.telegramChatId) await notifyUser(targets.telegramChatId, event, details);
      if (targets.email) {
        const email = await sendStageEmail(event, targets.email, details);
        if (!email.ok && !email.skipped) console.warn(`notifyChatMembers: ${event} email failed:`, email.error);
      }
      sent += 1;
    }
    return sent;
  } catch (cause) {
    console.error('notifyChatMembers failed:', cause instanceof Error ? cause.message : cause);
    return 0;
  }
}

// Member-facing stage delivery: one call reaches the founder on the two
// channels they actually check — their linked Telegram (when they have one)
// and their inbox (journey gap #4: proposal/signature/funding/delivery emails).
//
// Best-effort by construction, same rules as lib/notify.js:
// - never throws and never fails the caller's success path — a provider error
//   is logged here, the API route still answers 200;
// - the event name is shared with buildPersonalMessage (Telegram) and
//   buildStageEmail (email), so both channels say the same thing;
// - chatUrl is added here so routes only pass product details.
export async function notifyFounder(
  conversationId: string,
  event: string,
  details: Record<string, unknown> = {}
): Promise<{ telegram?: unknown; email?: unknown } | null> {
  try {
    const targets = await getFounderNotifyTargets(conversationId);
    const chatUrl = `${resolveSiteUrl()}/chat?conversationId=${encodeURIComponent(conversationId)}`;
    const payload = { ...details, chatUrl };

    const result: { telegram?: unknown; email?: unknown } = {};
    if (targets.telegramChatId) {
      result.telegram = await notifyUser(targets.telegramChatId, event, payload);
    }
    if (targets.email) {
      const email = await sendStageEmail(event, targets.email, payload);
      if (!email.ok && !email.skipped) {
        // Log the reason, never the recipient.
        console.warn(`notifyFounder: ${event} email failed:`, email.error);
      }
      result.email = email;
    }
    return result;
  } catch (cause) {
    console.error(
      'notifyFounder failed:',
      cause instanceof Error ? cause.message : cause
    );
    return null;
  }
}
