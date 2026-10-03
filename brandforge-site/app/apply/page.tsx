'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getSessionUser } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';

type ApplicationStatus = {
  id: string;
  status: 'pending' | 'accepted' | 'declined';
  message: string;
  created_at: string;
  reviewed_at: string | null;
} | null;

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  pending: {
    title: 'Application in review',
    body: 'Thanks — we read every application. If it is a fit, we will accept it and invite you into a chat.',
  },
  accepted: {
    title: 'You are accepted',
    body: 'You have operator access. We will invite you into a conversation when there is work to pick up.',
  },
  declined: {
    title: 'Not this time',
    body: 'We are keeping the team small for now. You are welcome to apply again later.',
  },
};

// What actually happens after a specialist applies, in the order it happens. Every step here is
// something the product really does (see /admin/applications + the identity/Telegram linking
// work). No invented SLAs, no "we usually reply within X" — we do not have measured numbers yet,
// so the copy describes the process rather than promising a timeframe we cannot keep.
const NEXT_STEPS = [
  {
    title: 'An admin reads your note',
    body: 'Every application is read by a person, not auto-rejected. If it is not a fit right now, you will see a decline here rather than silence.',
  },
  {
    title: 'If accepted, your account gets operator access',
    body: 'Accepting sets your profile role to operator, which is what grants you access to project chats. It is a role on your account, not a separate login.',
  },
  {
    title: 'Link Telegram if you want to be notified',
    body: 'Once accepted, you can link a Telegram account from Settings. We use it to tell you when a founder chat needs a specialist — it is optional.',
  },
  {
    title: 'Work arrives as chat invitations',
    body: 'There is no dashboard to check. When there is work that fits you, you will be invited into that founder’s conversation and it will appear in your chat list.',
  },
] as const;

export default function ApplyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [application, setApplication] = useState<ApplicationStatus>(null);
  const [message, setMessage] = useState('');
  // Honeypot: humans never see this field; bots that fill it get rejected server-side.
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function fetchApplication(): Promise<ApplicationStatus> {
    try {
      const response = await fetch('/api/applications');
      if (!response.ok) return null;
      const data = await response.json().catch(() => ({}));
      return data.application ?? null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;

    // Reaching the apply form at all is the specialist-funnel entry point.
    trackEvent('apply_started', { source: 'apply_page' });

    async function load() {
      const user = await getSessionUser();

      if (!user) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setSignedIn(true);
      }

      const existing = await fetchApplication();
      if (!cancelled) {
        setApplication(existing);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !message.trim()) return;

    setSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), website }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || 'Could not submit application');
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      setMessage('');
      setApplication({
        id: data.application?.id ?? '',
        status: 'pending',
        message: message.trim(),
        created_at: data.application?.created_at ?? new Date().toISOString(),
        reviewed_at: null,
      });
    } catch {
      setError('Could not submit application');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Apply" subtitle="Join BrandForge as a specialist.">
        <p className="text-sm text-muted">Loading…</p>
      </AppShell>
    );
  }

  if (!signedIn) {
    return (
      <AppShell title="Apply" subtitle="Join BrandForge as a specialist.">
        <div className="max-w-xl rounded-2xl border border-line bg-panel p-6">
          <h2 className="font-serif text-2xl text-foreground">Sign in first</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Applications are tied to your account. Sign in with Google, then come back here.
          </p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="mt-5 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-95"
          >
            Sign in
          </button>
        </div>
      </AppShell>
    );
  }

  if (application) {
    const copy = STATUS_COPY[application.status] ?? STATUS_COPY.pending;

    return (
      <AppShell title="Apply" subtitle="Join BrandForge as a specialist.">
        <div className="max-w-xl rounded-2xl border border-line bg-panel p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-copper">
            {application.status}
          </p>
          <h2 className="mt-2 font-serif text-2xl text-foreground">{copy.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{copy.body}</p>

          {application.status === 'pending' ? (
            <div className="mt-5 rounded-xl border border-line bg-background p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-muted">What happens next</p>
              <ol className="mt-3 space-y-3">
                {NEXT_STEPS.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] font-semibold text-muted"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{step.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted">{step.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
                This page always shows your current status — reload it any time to check whether your
                application has been accepted or declined. You do not need to email us to follow up.
              </p>
            </div>
          ) : null}

          {application.status === 'accepted' ? (
            <div className="mt-5 rounded-xl border border-line bg-background p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-muted">Your next step</p>
              <ol className="mt-3 space-y-3">
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] font-semibold text-muted">1</span>
                  <span className="text-xs leading-relaxed text-muted">
                    Link Telegram in Settings if you want to be told when a chat needs you. It is optional.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] font-semibold text-muted">2</span>
                  <span className="text-xs leading-relaxed text-muted">
                    Start a project of your own in chat, or wait to be invited into a founder’s conversation.
                  </span>
                </li>
              </ol>
            </div>
          ) : null}

          <div className="mt-5 rounded-xl border border-line bg-background p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted">Your note</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
              {application.message}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/chat"
              className="rounded-xl border border-line bg-background px-4 py-2 text-sm text-foreground transition hover:border-ember"
            >
              Back to chat
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-line px-4 py-2 text-sm text-muted transition hover:border-ember hover:text-foreground"
            >
              Home
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Apply" subtitle="Join BrandForge as a specialist.">
      <div className="max-w-xl rounded-2xl border border-line bg-panel p-6">
        <h2 className="font-serif text-2xl text-foreground">Work with us</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Designers, developers, reverse engineers and marketers: tell us how you work. An admin
          reviews every application and, if it is a fit, invites you into a project chat.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="apply-message"
              className="block text-xs uppercase tracking-[0.15em] text-muted"
            >
              How you work
            </label>
            <textarea
              id="apply-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={4000}
              placeholder="What you build, how you deliver, links to work…"
              className="mt-2 w-full resize-none rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground placeholder-muted outline-none transition focus:border-ember"
            />
          </div>

          {/* Honeypot: off-screen and unreachable by keyboard; only bots fill it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
            <label htmlFor="apply-website">Website</label>
            <input
              id="apply-website"
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
            >
              {error}
            </p>
          ) : null}

          {success ? (
            <p
              role="status"
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
            >
              Application submitted. We will review it shortly.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting || !message.trim()}
              className="rounded-xl bg-ember px-5 py-2 text-sm font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
            <Link
              href="/chat"
              className="rounded-xl border border-line px-4 py-2 text-sm text-muted transition hover:border-ember hover:text-foreground"
            >
              Back to chat
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
