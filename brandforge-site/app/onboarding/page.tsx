'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchAuthed } from '@/lib/browser-auth';

// One screen, not four: the two things we must collect (terms, age) and nothing else.
// The username is picked for them (changeable in Settings) so nobody stalls on a naming
// task before their first answer.
const ADJECTIVES = ['bright', 'bold', 'swift', 'calm', 'keen', 'lucky', 'sharp', 'vivid'];
const NOUNS = ['builder', 'maker', 'founder', 'spark', 'forge', 'studio', 'pilot', 'crafter'];

function randomHandle() {
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
  return `${pick(ADJECTIVES)}.${pick(NOUNS)}${Math.floor(100 + Math.random() * 900)}`;
}

async function pickAvailableUsername(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomHandle();
    try {
      const response = await fetchAuthed(
        `/api/identity/username-available?username=${encodeURIComponent(candidate)}`,
      );
      if (response.ok) {
        const data = (await response.json()) as { available?: boolean };
        if (data.available) return candidate;
      }
    } catch {
      // Try another candidate; the final write is checked by the database anyway.
    }
  }
  return `${randomHandle()}${Math.floor(Math.random() * 90 + 10)}`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  // Where to go when onboarding finishes: carried from the OAuth callback so a
  // specialist who signed up from /apply still lands there. Same-site absolute path
  // only, else /chat. A ref: it is only read at redirect time.
  const nextPathRef = useRef('/chat');

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Signed-out visitors go to login; users who already finished go straight on.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('next');
    const safe =
      typeof raw === 'string' &&
      raw.startsWith('/') &&
      !raw.startsWith('//') &&
      !raw.startsWith('/\\')
        ? raw
        : '/chat';
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
        setChecking(false);
      } catch {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function finish() {
    if (submitting || !termsAccepted || !dateOfBirth) return;
    setSubmitting(true);
    setError('');
    try {
      const username = await pickAvailableUsername();
      const response = await fetchAuthed('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date_of_birth: dateOfBirth,
          accept_terms: termsAccepted,
          marketing_opt_in: marketingOptIn,
          username,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
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
      <Link href="/" className="font-serif text-xl text-foreground" aria-label="BrandForge home">
        Brand<span className="text-ember">Forge</span>
      </Link>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void finish();
        }}
        className="mt-8 w-full max-w-md rounded-2xl border border-line bg-panel p-6 sm:p-8"
      >
        <h1 className="font-serif text-2xl sm:text-3xl">Almost in</h1>
        <p className="mt-1 text-sm text-muted">Two quick things, then your chat opens.</p>

        <label htmlFor="dob" className="mt-6 block text-sm text-muted">
          Date of birth <span className="text-xs">(you must be 13 or older)</span>
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
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--ember)]"
          />
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
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(event) => setMarketingOptIn(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--ember)]"
          />
          <span>Email me tips for getting started and news about new features. About one a week at most, and one click to stop.</span>
        </label>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!termsAccepted || !dateOfBirth || submitting}
          className="mt-6 w-full rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Setting up…' : 'Open my chat'}
        </button>
        <p className="mt-3 text-center text-xs text-muted">We pick a username for you. Change it anytime in Settings.</p>
      </form>
    </main>
  );
}
