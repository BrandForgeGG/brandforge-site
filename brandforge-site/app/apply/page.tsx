'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { useLogin } from '@/components/login-dialog';
import { getSessionUser } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';

type ApplicationStatus = {
  id: string;
  status: 'pending' | 'accepted' | 'declined';
  message?: string;
  created_at: string;
  reviewed_at?: string | null;
} | null;

const SPECIALTIES = ['Design', 'Development', 'Video and motion', 'Marketing', 'Writing', 'Strategy', 'Other'];

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  pending: { title: 'Application in review', body: 'A person reads every application. If it is a fit, we accept it and you get access to offer services and join project chats.' },
  accepted: { title: 'You are accepted', body: 'You can now list services in the Trade Center and be invited into project chats.' },
  declined: { title: 'Not this time', body: 'We are keeping the team small for now. You are welcome to apply again later.' },
};

const STEPS = [
  { title: 'Apply', line: 'Two minutes, no account needed.' },
  { title: 'We review', line: 'A person reads it and decides.' },
  { title: 'You are in', line: 'Offer services in Trade and join project chats.' },
];

export default function ApplyPage() {
  const { openLogin } = useLogin();
  const [loading, setLoading] = useState(true);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [application, setApplication] = useState<ApplicationStatus>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [links, setLinks] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedAsGuest, setSubmittedAsGuest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    trackEvent('apply_started', { source: 'apply_page' });
    void (async () => {
      const user = await getSessionUser();
      if (user && !cancelled) {
        setSignedInEmail(user.email ?? null);
        try {
          const response = await fetch('/api/applications');
          const data = await response.json().catch(() => ({}));
          if (!cancelled) setApplication(data.application ?? null);
        } catch {
          /* the form still works */
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email: signedInEmail ?? email, specialty, links, message, website }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Could not submit your application.');
        return;
      }
      setSubmittedAsGuest(!signedInEmail);
      setApplication({ id: data.application?.id ?? '', status: 'pending', message, created_at: data.application?.created_at ?? new Date().toISOString() });
    } catch {
      setError('Connection problem. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const field = 'mt-1.5 w-full rounded-xl border border-line bg-background px-4 py-2.5 text-sm text-foreground placeholder-muted outline-none transition focus:border-ember';
  const label = 'block text-sm text-muted';

  if (loading) {
    return (
      <AppShell title="Apply" subtitle="Join the BrandForge team.">
        <p className="text-sm text-muted">Loading…</p>
      </AppShell>
    );
  }

  if (application) {
    const copy = STATUS_COPY[application.status] ?? STATUS_COPY.pending;
    return (
      <AppShell title="Apply" subtitle="Join the BrandForge team.">
        <div className="max-w-xl rounded-2xl border border-line bg-panel p-6">
          <h2 className="font-serif text-2xl text-foreground">{copy.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{copy.body}</p>

          {submittedAsGuest ? (
            <div className="mt-5 rounded-xl border border-ember/30 bg-ember/10 p-4">
              <p className="text-sm text-foreground">Create a free account with the same email.</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                It lets you follow your application here, and if you are accepted your access switches on the moment you sign in.
              </p>
              <button
                type="button"
                onClick={() => openLogin({ reason: 'signin', next: '/apply' })}
                className="mt-3 rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90"
              >
                Create my account
              </button>
            </div>
          ) : null}

          {application.status === 'pending' ? (
            <ol className="mt-5 space-y-3" aria-label="What happens next">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-muted">
                    {index + 1}
                  </span>
                  <span className="text-sm">
                    <span className="text-foreground">{step.title}.</span> <span className="text-muted">{step.line}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/chat" className="rounded-xl border border-line px-4 py-2 text-sm text-foreground transition hover:border-ember">
              Back to chat
            </Link>
            {application.status === 'accepted' ? (
              <Link href="/trade" className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90">
                Open the Trade Center
              </Link>
            ) : null}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Apply" subtitle="Join the BrandForge team.">
      <div className="max-w-xl">
        <h2 className="font-serif text-2xl tracking-[-0.02em] text-foreground">Work with us</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The BrandForge team offers services in the Trade Center and joins project chats. Tell us how you work. A person reads every application.
        </p>

        {!signedInEmail ? (
          <p className="mt-4 rounded-xl border border-line bg-panel px-4 py-3 text-xs leading-relaxed text-muted">
            No account needed to apply. We recommend creating one once, with the same email, so you can follow your application and switch on access the moment you are accepted.{' '}
            <button type="button" onClick={() => openLogin({ reason: 'signin', next: '/apply' })} className="text-ember underline-offset-2 hover:underline">
              Sign up free
            </button>
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="apply-name" className={label}>
                Your name
              </label>
              <input id="apply-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} autoComplete="name" className={field} placeholder="Maya Chen" />
            </div>
            <div>
              <label htmlFor="apply-email" className={label}>
                Email
              </label>
              <input
                id="apply-email"
                type="email"
                required
                value={signedInEmail ?? email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={Boolean(signedInEmail)}
                autoComplete="email"
                className={`${field} ${signedInEmail ? 'opacity-70' : ''}`}
                placeholder="you@studio.com"
              />
            </div>
          </div>

          <fieldset>
            <legend className={label}>What you do</legend>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="What you do">
              {SPECIALTIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={specialty === item}
                  onClick={() => setSpecialty(item)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition ${specialty === item ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="apply-links" className={label}>
              Links to your work <span className="text-muted">(optional)</span>
            </label>
            <input id="apply-links" value={links} onChange={(e) => setLinks(e.target.value)} maxLength={1000} className={field} placeholder="Portfolio, GitHub, a past project…" />
          </div>

          <div>
            <label htmlFor="apply-message" className={label}>
              How you work
            </label>
            <textarea
              id="apply-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              className={`${field} resize-none`}
              placeholder="What you build, how you deliver, what a good project looks like for you."
            />
          </div>

          <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
            <label htmlFor="apply-website">Website</label>
            <input id="apply-website" type="text" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || !specialty || message.trim().length < 20 || !(signedInEmail ?? email).includes('@')}
            className="rounded-xl bg-ember px-6 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send application'}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
