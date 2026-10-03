'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchAuthed } from '@/lib/browser-auth';

type Step = 1 | 2 | 3 | 4;

const STEPS: { label: string }[] = [
  { label: 'Policies' },
  { label: 'Birthday' },
  { label: 'What you get' },
  { label: 'Username' },
];

// The three things a first-time user should know before describing a project.
const FIRST_PROJECT_CARDS = [
  {
    title: 'Talk, then a structured brief',
    body: 'Describe what you want in plain language. The AI asks the sharp questions and turns your chat into a structured brief — no forms to fill.',
  },
  {
    title: 'Approve before you pay',
    body: 'Specialists answer with scope, price and timeline. You accept, counter, or decline. Nothing is charged while you decide.',
  },
  {
    title: 'You release the money',
    body: 'Funds sit in escrow and release per milestone, only after you approve the work.',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [checking, setChecking] = useState(true);
  // Where to go when the wizard finishes — carried from the OAuth callback so a
  // specialist who signed up from /apply still lands there. Same rules as the
  // server-side sanitizer: same-site absolute path only, else /chat. A ref, not
  // state: it is only read at redirect time, so no re-render is needed.
  const nextPathRef = useRef('/chat');

  // Step 1 — policies.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(true);

  // Step 2 — birthday.
  const [dateOfBirth, setDateOfBirth] = useState('');

  // Step 4 — username.
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [usernameHint, setUsernameHint] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const availabilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Signed-out visitors go to login; users who already finished onboarding go
  // straight to wherever they were headed. fetchAuthed parks a dead session on
  // /login itself.
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

  const checkUsername = useCallback(async (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length < 3) {
      setUsernameStatus('idle');
      setUsernameHint('');
      return;
    }

    setUsernameStatus('checking');
    setUsernameHint('');
    try {
      const response = await fetchAuthed(
        `/api/identity/username-available?username=${encodeURIComponent(trimmed)}`,
      );
      if (!response.ok) {
        setUsernameStatus('idle');
        return;
      }
      const data = (await response.json()) as {
        available?: boolean;
        reason?: string;
        username?: string;
      };
      if (data.available) {
        setUsernameStatus('available');
        setUsernameHint('');
      } else {
        setUsernameStatus(data.reason ? 'invalid' : 'taken');
        setUsernameHint(data.reason ?? 'That username is taken.');
      }
    } catch {
      setUsernameStatus('idle');
    }
  }, []);

  function handleUsernameChange(value: string) {
    setUsername(value);
    if (availabilityTimer.current) clearTimeout(availabilityTimer.current);
    availabilityTimer.current = setTimeout(() => void checkUsername(value), 400);
  }

  useEffect(() => {
    return () => {
      if (availabilityTimer.current) clearTimeout(availabilityTimer.current);
    };
  }, []);

  function back() {
    setError('');
    setStep((current) => (current === 1 ? 1 : ((current - 1) as Step)));
  }

  function next() {
    setError('');
    setStep((current) => (current === 4 ? 4 : ((current + 1) as Step)));
  }

  async function finish() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetchAuthed('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date_of_birth: dateOfBirth,
          accept_terms: termsAccepted,
          marketing_opt_in: marketingOptIn,
          username: username.trim().toLowerCase(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error || 'Could not save your setup.');
        setSubmitting(false);
        return;
      }
      router.replace(nextPathRef.current);
    } catch {
      setError('Could not save your setup. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
      <Link href="/" className="font-serif text-xl text-foreground" aria-label="BrandForge home">
        Brand<span className="text-ember">Forge</span>
      </Link>

      <div className="mt-8 w-full max-w-xl rounded-2xl border border-line bg-panel p-6 sm:p-8">
        {/* Progress: four ticks, current one ember. */}
        <div className="flex items-center gap-2" aria-hidden="true">
          {STEPS.map((s, index) => (
            <span
              key={s.label}
              className={`h-1 flex-1 rounded-full ${
                index + 1 <= step ? 'bg-ember' : 'bg-line'
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-muted">
          Step {step} of 4 · {STEPS[step - 1].label}
        </p>

        {step === 1 ? (
          <section>
            <h1 className="mt-3 font-serif text-2xl sm:text-3xl">A few housekeeping items</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Two quick decisions and you are in.
            </p>

            <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--ember)]"
              />
              <span>
                I accept the{' '}
                <Link href="/terms" className="text-ember underline-offset-2 hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-ember underline-offset-2 hover:underline">
                  Privacy Policy
                </Link>
                . Required to use BrandForge.
              </span>
            </label>

            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--ember)]"
              />
              <span>
                Send me occasional product updates by email. Opt out anytime from Settings.
              </span>
            </label>

            <button
              type="button"
              disabled={!termsAccepted}
              onClick={next}
              className="mt-8 w-full rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue
            </button>
          </section>
        ) : null}

        {step === 2 ? (
          <section>
            <h1 className="mt-3 font-serif text-2xl sm:text-3xl">When were you born?</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              BrandForge is for people aged 13 and over. We only use this to confirm that.
            </p>

            <label htmlFor="dob" className="mt-6 block text-sm text-muted">
              Date of birth
            </label>
            <input
              id="dob"
              type="date"
              value={dateOfBirth}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-ember"
            />

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={back}
                className="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-overlay"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!dateOfBirth}
                onClick={next}
                className="flex-1 rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section>
            <h1 className="mt-3 font-serif text-2xl sm:text-3xl">
              Before your first project with us
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Three things worth knowing before you describe anything.
            </p>

            <div className="mt-6 space-y-4">
              {FIRST_PROJECT_CARDS.map((card, index) => (
                <div key={card.title} className="rounded-xl border border-line bg-background p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ember/10 text-xs font-semibold text-ember">
                      {index + 1}
                    </span>
                    <p className="font-serif text-base text-foreground">{card.title}</p>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{card.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={back}
                className="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-overlay"
              >
                Back
              </button>
              <button
                type="button"
                onClick={next}
                className="flex-1 rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-background transition hover:opacity-95"
              >
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section>
            <h1 className="mt-3 font-serif text-2xl sm:text-3xl">Pick a username</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              This is how specialists and your team will see you in chats.
            </p>

            <label htmlFor="username" className="mt-6 block text-sm text-muted">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              spellCheck={false}
              placeholder="alex.builds"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && usernameStatus === 'available') void finish();
              }}
              className="mt-2 w-full rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-ember"
              aria-describedby="username-hint"
            />
            <p
              id="username-hint"
              role="status"
              className={`mt-2 text-xs ${
                usernameStatus === 'available'
                  ? 'text-success'
                  : usernameStatus === 'taken' || usernameStatus === 'invalid'
                    ? 'text-danger'
                    : 'text-muted'
              }`}
            >
              {usernameStatus === 'checking'
                ? 'Checking…'
                : usernameStatus === 'available'
                  ? 'Available.'
                  : usernameHint || 'Letters, numbers, dots or underscores · 3–24 characters.'}
            </p>

            {error ? (
              <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={back}
                disabled={submitting}
                className="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-overlay disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                disabled={usernameStatus !== 'available' || submitting}
                onClick={() => void finish()}
                className="flex-1 rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Setting up…' : 'Finish and open the chat'}
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <p className="mt-6 text-xs text-muted">
        Questions?{' '}
        <Link href="/terms" className="text-ember underline-offset-2 hover:underline">
          Read the policies
        </Link>{' '}
        or ask in the Discord.
      </p>
    </main>
  );
}
