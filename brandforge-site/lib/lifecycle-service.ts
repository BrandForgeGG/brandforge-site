import { claimEmailSend, getSequenceAudience, releaseEmailSend } from '@/lib/project-db';
import { nextSequenceEmail } from '@/lib/email-sequences.js';
import { sendStageEmail } from '@/lib/email';
import { makeUnsubscribeToken } from '@/lib/unsubscribe-token';

// The daily email sequence for new members. Reads who is due, claims each send in the database before
// the email goes out (so a step can never be sent twice), sends it, and gives the claim back if the
// email failed so tomorrow retries. Product updates only: people who opted in, never test accounts.
//
// LIFECYCLE_ENABLED must be exactly "true" for anything to be sent. Without it the run is a dry run
// that only reports who would get what, so the first real send is always a decision.

const MAX_PER_RUN = 40;
const SITE = 'https://brandforge.gg';

export type LifecycleReport = {
  dryRun: boolean;
  considered: number;
  due: { kind: string; count: number }[];
  sent: number;
  failed: number;
};

export async function runLifecycle(options: { forceDry?: boolean } = {}): Promise<LifecycleReport> {
  const dryRun = options.forceDry === true || process.env.LIFECYCLE_ENABLED !== 'true';
  const report: LifecycleReport = { dryRun, considered: 0, due: [], sent: 0, failed: 0 };
  const people = await getSequenceAudience(new Date(Date.now() - 23 * 24 * 60 * 60 * 1000).toISOString());
  report.considered = people.length;

  const counts = new Map<string, number>();
  let budget = MAX_PER_RUN;
  for (const person of people) {
    if (budget <= 0) break;
    const kind = nextSequenceEmail({ createdAt: person.createdAt, optIn: true, hasCarousel: person.hasCarousel, hasChat: person.hasChat, sent: person.sent, lastSentAt: person.lastSentAt });
    if (!kind) continue;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    budget -= 1;
    if (dryRun) continue;
    if (!(await claimEmailSend(person.id, kind))) continue;
    const token = makeUnsubscribeToken(person.id);
    const result = await sendStageEmail(kind, person.email, token ? { unsubscribeUrl: `${SITE}/api/email/unsubscribe?token=${token}` } : {});
    if (result.ok) {
      report.sent += 1;
    } else {
      report.failed += 1;
      await releaseEmailSend(person.id, kind);
    }
  }
  report.due = [...counts.entries()].map(([kind, count]) => ({ kind, count }));
  return report;
}

// A one-time note to opted-in members who joined before the sequence existed (it only covers the first
// three weeks). Sent once per person, claimed like every sequence email. Same switch as the sequence:
// without LIFECYCLE_ENABLED=true it only reports who would receive it.
export async function runBroadcast(kind: 'whats_new', options: { forceDry?: boolean } = {}): Promise<LifecycleReport> {
  const dryRun = options.forceDry === true || process.env.LIFECYCLE_ENABLED !== 'true';
  const report: LifecycleReport = { dryRun, considered: 0, due: [], sent: 0, failed: 0 };
  const everyone = await getSequenceAudience('2000-01-01T00:00:00Z');
  const cutoff = Date.now() - 22 * 24 * 60 * 60 * 1000;
  const people = everyone.filter((p) => new Date(p.createdAt).getTime() < cutoff && !p.sent.includes(kind));
  report.considered = people.length;
  report.due = [{ kind, count: people.length }];
  if (dryRun) return report;
  for (const person of people.slice(0, MAX_PER_RUN)) {
    if (!(await claimEmailSend(person.id, kind))) continue;
    const token = makeUnsubscribeToken(person.id);
    const result = await sendStageEmail(kind, person.email, token ? { unsubscribeUrl: `${SITE}/api/email/unsubscribe?token=${token}` } : {});
    if (result.ok) report.sent += 1;
    else {
      report.failed += 1;
      await releaseEmailSend(person.id, kind);
    }
  }
  return report;
}
