import { Resend } from 'resend';
import { buildStageEmail } from './stage-emails';

// Transactional email via Resend. The API key lives only in env
// (`.env.local` locally, Vercel project env in production) — never in source.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
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

export function isEmailConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY ?? '').trim());
}

function fromAddress(): string {
  return (
    (process.env.RESEND_FROM ?? '').trim() ||
    'BrandForge <onboarding@resend.dev>'
  );
}

export async function sendEmail(
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

  return sendEmail({
    to: recipient,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}
