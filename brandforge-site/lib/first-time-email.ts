import { claimEmailSend, releaseEmailSend } from '@/lib/project-db';
import { sendStageEmail } from '@/lib/email';
import { makeUnsubscribeToken } from '@/lib/unsubscribe-token';
import { isTestEmail } from '@/lib/real-activity';

// "You did it" emails: the first chat, the first saved carousel, the first listing, the first connected
// channel. Each one confirms what just happened and offers a single next step. They are service
// messages about the person's own action, so they go to everyone, once per kind: the database claim
// (unique per person and kind) means a second carousel never sends a second "first carousel" mail.
// Best effort: a failure is logged and never reaches the person's request.
export type FirstTimeKind = 'first_chat' | 'first_carousel' | 'first_listing' | 'first_channel';

export async function sendFirstTimeEmail(userId: string, email: string | null | undefined, kind: FirstTimeKind, details: Record<string, unknown> = {}): Promise<void> {
  try {
    if (!email || isTestEmail(email)) return;
    if (!(await claimEmailSend(userId, kind))) return;
    const token = makeUnsubscribeToken(userId);
    const result = await sendStageEmail(kind, email, {
      ...details,
      ...(token ? { unsubscribeUrl: `https://brandforge.gg/api/email/unsubscribe?token=${token}` } : {}),
    });
    if (!result.ok) {
      await releaseEmailSend(userId, kind);
      console.warn('first-time email not sent:', kind, result.error);
    }
  } catch (cause) {
    console.warn('first-time email failed:', kind, cause instanceof Error ? cause.message : cause);
  }
}
