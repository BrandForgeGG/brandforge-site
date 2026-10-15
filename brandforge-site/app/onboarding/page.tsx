'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchAuthed, getSessionUser } from '@/lib/browser-auth';
import { validateUsername } from '@/lib/identity';
import { BrandMark } from '@/components/brand-mark';

// The first screen after signing up for the first time: the name you go by on BrandForge (your username, shown
// everywhere), then the two things we must collect (age and terms). One screen, then your chat opens.

/** A starting suggestion from the person's own name or email: lowercase letters, numbers and dots. */
function suggestionFrom(name: string, email: string): string {
  const base = (name || email.split('@')[0] || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 20);
  return base.length >= 3 ? base : '';
}

type Check = 'idle' | 'checking' | 'free' | 'taken' | 'invalid';

export default function OnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  // Where to go when onboarding finishes: carried from the OAuth callback so a
  // specialist who signed up from /apply still lands there. Same-site absolute path
  // only, else /chat. A ref: it is only read at redirect time.
  const nextPathRef = useRef('/chat');

  const [username, setUsername] = useState('');
  const [usernameCheck, setUsernameCheck] = useState<Check>('idle');
  const [usernameHint, setUsernameHint] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Signed-out visitors go to login; users who already finished go straight on. Everyone else starts with a suggested
  // username taken from their own name.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('next');
    const safe = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/chat';
    nextPathRef.current = safe;

    let cancelled = false;
    (async () => {
      try {
        const response = await fetchAuthed('/api/identity');
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json();
          if (data?.onboarding_completed !== false) {
            router.replace(safe);
            return;
          }
        }
        const user = await getSessionUser().catch(() => null);
        const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
        if (!cancelled) setUsername(suggestionFrom(meta.full_name || meta.name || '', user?.email ?? ''));
        setChecking(false);
      } catch {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Say right away whether the username can be used.
  useEffect(() => {
    if (!username) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to check until there is a name
      setUsernameCheck('idle');
      return;
    }
    const checked = validateUsername(username);
    if (!checked.ok) {
      setUsernameCheck('invalid');
      setUsernameHint(checked.reason);
      return;
    }
    setUsernameCheck('checking');
    let live = true;
    const timer = window.setTimeout(() => {
      void fetchAuthed(`/api/identity/username-available?username=${encodeURIComponent(checked.username)}`)
        .then((res) => res.json())
        .then((data: { available?: boolean }) => live && setUsernameCheck(data.available ? 'free' : 'taken'))
        .catch(() => live && setUsernameCheck('idle'));
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [username]);

  const ready = usernameCheck === 'free' && termsAccepted && Boolean(dateOfBirth);

  async function finish() {
    if (submitting || !ready) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetchAuthed('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_of_birth: dateOfBirth, accept_terms: termsAccepted, marketing_opt_in: marketingOptIn, username }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        if (response.status === 409) setUsernameCheck('taken');
        setError(data.error || 'Could not save your setup. Try again.');
        setSubmitting(false);
        return;
      }
      router.replace(nextPathRef.current);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
      <Link href="/" className="text-xl" aria-label="BrandForge home">
        <BrandMark size={30} />
      </Link>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void finish();
        }}
        className="mt-8 w-full max-w-md rounded-3xl border border-line bg-panel p-6 shadow-[var(--shadow-soft)] sm:p-8"
      >
        <h1 className="font-serif text-2xl sm:text-3xl">Welcome to BrandForge</h1>
        <p className="mt-1 text-sm text-muted">Pick the name you go by here, then your chat opens.</p>

        <label htmlFor="username" className="mt-6 block text-sm text-foreground">
          Your username
        </label>
        <div className="mt-2 flex items-center rounded-xl border border-line bg-background px-4 focus-within:border-ember">
          <span className="text-sm text-muted" aria-hidden="true">@</span>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s+/g, ''))}
            maxLength={24}
            autoComplete="username"
            autoFocus
            placeholder="yourname"
            className="w-full bg-transparent py-3 pl-1 text-sm text-foreground outline-none"
          />
        </div>
        <p className={`mt-1.5 text-xs ${usernameCheck === 'taken' || usernameCheck === 'invalid' ? 'text-danger' : usernameCheck === 'free' ? 'text-success' : 'text-muted'}`} aria-live="polite">
          {usernameCheck === 'taken'
            ? 'That username is taken. Try another.'
            : usernameCheck === 'invalid'
              ? usernameHint
              : usernameCheck === 'free'
                ? 'Available. This is the name everyone sees.'
                : usernameCheck === 'checking'
                  ? 'Checking…'
                  : 'This is the name everyone sees: 3 to 24 letters, numbers, dots or underscores.'}
        </p>

        <label htmlFor="dob" className="mt-5 block text-sm text-foreground">
          Date of birth <span className="text-xs text-muted">(you must be 13 or older)</span>
        </label>
        <input
          id="dob"
          type="date"
          autoComplete="bday"
          value={dateOfBirth}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(event) => setDateOfBirth(event.target.value)}
          className="mt-2 w-full rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-ember"
        />

        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-foreground">
          <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--ember)]" />
          <span>
            I accept the{' '}
            <Link href="/terms" className="text-ember underline-offset-2 hover:underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-ember underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-muted">
          <input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--ember)]" />
          <span>Email me tips for getting started and news about new features. About one a week at most, and one click to stop.</span>
        </label>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={!ready || submitting} className="mt-6 w-full rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-on-ember transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">
          {submitting ? 'Setting up…' : 'Open my chat'}
        </button>
        <p className="mt-3 text-center text-xs text-muted">You can change your username later in Settings.</p>
      </form>
    </main>
  );
}
