import { notifyUser } from './notify';
import { sendStageEmail } from './email';
import { getFounderNotifyTargets } from './project-db';
import { resolveSiteUrl } from './auth-utils';

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
