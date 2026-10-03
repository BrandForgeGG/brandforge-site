'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/funnel-client';
import {
  buildOAuthRedirectUrl,
  getAuthErrorMessage,
  isValidEmail,
  resolveSiteUrl,
} from '@/lib/auth-utils';

// The right-side diagram: what actually happens between an idea and shipped work.
const FLOW = [
  {
    title: 'Describe it',
    body: 'One message in chat. The AI asks the sharp questions and structures the brief.',
  },
  {
    title: 'Get a proposal',
    body: 'A vetted specialist sends scope, price, and timeline. Accept, counter, or decline.',
  },
  {
    title: 'Fund escrow',
    body: 'Crypto in, verified on-chain. You are not charged before you approve anything.',
  },
  {
    title: 'Ship and release',
    body: 'Milestones are approved by you. Payment releases only when the work passes.',
  },
];

export function AuthSplit() {
  const [loading, setLoading] = useState<'google' | 'email' | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(() => {
    if (typeof window === 'undefined') return '';
    const callbackError = new URLSearchParams(window.location.search).get('error');
    return callbackError ? decodeURIComponent(callbackError) : '';
  });

  function redirectUrl() {
    const siteUrl = resolveSiteUrl(
      process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== 'undefined' ? window.location.origin : '')
    );
    return buildOAuthRedirectUrl('/chat', siteUrl);
  }

  async function handleGoogleSignIn() {
    setLoading('google');
    setError('');
    setMessage('');

    // Intent, not outcome: recorded before the OAuth redirect so a drop-off between here and
    // Google is still visible in the funnel.
    trackEvent('signin_started', { source: 'google' });

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl(),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (oauthError) {
      console.error('Google OAuth error:', oauthError);
      setError(
        /provider|google|oauth/i.test(oauthError?.message ?? '')
          ? 'Google sign-in is not available right now. Try again or ask for help in the Discord.'
          : getAuthErrorMessage(oauthError?.code ?? 'generic')
      );
      setLoading(null);
      return;
    }

    setMessage('Opening Google…');
  }

  async function handleEmailSignIn(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();

    if (!isValidEmail(trimmed)) {
      setError(getAuthErrorMessage('invalid_email'));
      setMessage('');
      return;
    }

    setLoading('email');
    setError('');
    setMessage('');

    trackEvent('signin_started', { source: 'email' });

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectUrl() },
    });

    if (otpError) {
      console.error('Email sign-in error:', otpError);
      setError(getAuthErrorMessage(otpError?.code ?? 'generic'));
      setLoading(null);
      return;
    }

    setMessage(`Check your inbox — we sent a sign-in link to ${trimmed}. Open it on this device to continue.`);
    setLoading(null);
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Left: the actual sign-in choices. */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-10 lg:w-[55%] lg:px-20">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="font-serif text-2xl text-foreground" aria-label="BrandForge home">
            Brand<span className="text-ember">Forge</span>
          </Link>

          <h1 className="mt-8 font-serif text-3xl text-foreground sm:text-4xl">
            Sign in to BrandForge
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Open the chat, describe what you want to build, and get a priced proposal.
          </p>

          <div className="mt-8 space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-foreground px-4 py-3 font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-background text-xs font-bold text-foreground">
                G
              </span>
              Continue with Google
            </button>

            <div className="flex items-center gap-4" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={handleEmailSignIn} className="space-y-3">
              <label htmlFor="auth-email" className="block text-sm text-muted">
                Continue with email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-base text-foreground outline-none transition focus:border-ember"
              />
              <button
                type="submit"
                disabled={loading !== null}
                className="w-full rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading === 'email' ? 'Sending…' : 'Continue with email'}
              </button>
            </form>

            {error ? (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
            {message ? (
              <p role="status" className="rounded-lg border border-trust/30 bg-trust/10 px-3 py-2 text-sm text-success">
                {message}
              </p>
            ) : null}
          </div>

          <p className="mt-6 text-xs leading-relaxed text-muted">
            By continuing, you acknowledge our{' '}
            <Link href="/terms" className="text-ember underline-offset-2 hover:underline">
              policies
            </Link>
            . You must accept the Terms of Service when you set up your account.
          </p>

          <p className="mt-6 text-sm text-muted">
            Want to work with us?{' '}
            <Link href="/apply" className="font-medium text-ember">
              Apply as a specialist
            </Link>
          </p>
        </div>
      </div>

      {/* Right: the diagram — what the product actually does with an idea. */}
      <aside
        className="hidden border-l border-line bg-panel lg:flex lg:w-[45%] lg:flex-col lg:justify-center lg:px-16"
        aria-hidden="true"
      >
        <div className="mx-auto w-full max-w-sm">
          <p className="text-[11px] uppercase tracking-[0.2em] text-copper">How a project moves</p>
          <h2 className="mt-2 font-serif text-2xl text-foreground">
            From idea to shipped
          </h2>

          <ol className="mt-8 space-y-6">
            {FLOW.map((step, index) => (
              <li key={step.title} className="relative flex gap-4">
                {index < FLOW.length - 1 ? (
                  <span className="absolute left-[15px] top-10 h-[calc(100%+0.5rem)] w-px bg-line" />
                ) : null}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ember/40 bg-ember/10 text-sm font-semibold text-ember">
                  {index + 1}
                </span>
                <div className="pb-1">
                  <p className="font-serif text-lg text-foreground">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-10 text-xs uppercase tracking-[0.15em] text-muted">
            Escrow-protected · Two-sided contracts · Approve before payment
          </p>
        </div>
      </aside>
    </div>
  );
}
