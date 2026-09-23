'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getSessionUser } from '@/lib/browser-auth';

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

export default function ApplyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [application, setApplication] = useState<ApplicationStatus>(null);
  const [message, setMessage] = useState('');
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
        body: JSON.stringify({ message: message.trim() }),
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
        <p className="text-sm text-[#9aa0a6]">Loading…</p>
      </AppShell>
    );
  }

  if (!signedIn) {
    return (
      <AppShell title="Apply" subtitle="Join BrandForge as a specialist.">
        <div className="max-w-xl rounded-2xl border border-white/10 bg-[#1c2024] p-6">
          <h2 className="font-serif text-2xl text-[#ece7de]">Sign in first</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#9aa0a6]">
            Applications are tied to your account. Sign in with Google, then come back here.
          </p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="mt-5 rounded-xl bg-[#e8571e] px-4 py-2 text-sm font-semibold text-[#14171a] transition hover:opacity-95"
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
        <div className="max-w-xl rounded-2xl border border-white/10 bg-[#1c2024] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">
            {application.status}
          </p>
          <h2 className="mt-2 font-serif text-2xl text-[#ece7de]">{copy.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#9aa0a6]">{copy.body}</p>

          <div className="mt-5 rounded-xl border border-white/10 bg-[#14171a] p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-[#6f757b]">Your note</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[#ece7de]">
              {application.message}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/chat"
              className="rounded-xl border border-white/10 bg-[#14171a] px-4 py-2 text-sm text-[#ece7de] transition hover:border-[#e8571e]"
            >
              Back to chat
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-[#9aa0a6] transition hover:border-[#e8571e] hover:text-[#ece7de]"
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
      <div className="max-w-xl rounded-2xl border border-white/10 bg-[#1c2024] p-6">
        <h2 className="font-serif text-2xl text-[#ece7de]">Work with us</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#9aa0a6]">
          Designers, developers, reverse engineers and marketers: tell us how you work. An admin
          reviews every application and, if it is a fit, invites you into a project chat.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="apply-message"
              className="block text-xs uppercase tracking-[0.15em] text-[#6f757b]"
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
              className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-[#14171a] px-4 py-3 text-sm text-[#ece7de] placeholder-[#6f757b] outline-none transition focus:border-[#e8571e]"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          {success ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              Application submitted. We will review it shortly.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting || !message.trim()}
              className="rounded-xl bg-[#e8571e] px-5 py-2 text-sm font-semibold text-[#14171a] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
            <Link
              href="/chat"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-[#9aa0a6] transition hover:border-[#e8571e] hover:text-[#ece7de]"
            >
              Back to chat
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
