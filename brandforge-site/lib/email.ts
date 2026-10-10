import { Resend } from 'resend';
import { buildStageEmail } from './stage-emails';
import { logEmailAttempt } from './project-db';

// Transactional email via Resend. The API key lives only in env
// (`.env.local` locally, Vercel project env in production) — never in source.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
};

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string; skipped?: boolean };

let client: Resend | null = null;

function getClient(): Resend | null {
  const key = (process.env.RESEND_API_KEY ?? '').trim();
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

function fromAddress(): string {
  return (
    (process.env.RESEND_FROM ?? '').trim() ||
    'BrandForge <onboarding@resend.dev>'
  );
}

// Sends, then writes one line to the email log (recipient, subject, delivered or not) so an admin can see it.
export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const result = await deliver(input);
  if (!('skipped' in result && result.skipped)) {
    await logEmailAttempt({ to: input.to, subject: input.subject, ok: result.ok, error: result.ok ? null : result.error, providerId: result.ok ? result.id : null });
  }
  return result;
}

async function deliver(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const resend = getClient();
  if (!resend) {
    return { ok: false, error: 'Email is not configured', skipped: true };
  }

  try {
    const send = resend.emails.send({
      from: fromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
    });

    // The SDK has no per-request timeout; never let a hung provider call
    // hold a route handler open.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Email provider timed out')), 10000)
    );
    const { data, error } = await Promise.race([send, timeout]);

    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Email failed to send',
    };
  }
}

// Stage-transition email (proposal ready, contract signed, funding verified,
// work delivered, payment released): build the template, then send. Like every
// notify path it is best-effort — no recipient or unknown event is a silent
// skip, never a throw.
export async function sendStageEmail(
  event: string,
  to: string | null | undefined,
  details: Record<string, unknown> = {}
): Promise<SendEmailResult> {
  const recipient = (to ?? '').trim();
  if (!recipient) return { ok: false, error: 'No recipient', skipped: true };

  const template = buildStageEmail(event, details);
  if (!template) return { ok: false, error: 'Unknown stage event', skipped: true };

  // Product-update mail carries the one-click unsubscribe header mail apps look for.
  const unsubscribe = typeof details.unsubscribeUrl === 'string' && /^https:\/\/\S+$/.test(details.unsubscribeUrl) ? details.unsubscribeUrl : null;

  return sendEmail({
    to: recipient,
    ...(unsubscribe ? { headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}
