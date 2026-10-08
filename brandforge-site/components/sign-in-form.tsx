'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/funnel-client';
import { buildOAuthRedirectUrl, getAuthErrorMessage, isValidEmail, resolveSiteUrl } from '@/lib/auth-utils';

// The sign-in choices, shared by the /login page and the sign-in pop-up. `next` is where the
// person lands after signing in; without it the form honours ?next= in the address.
export function SignInForm({ next }: { next?: string }) {
  const [loading, setLoading] = useState<'google' | 'email' | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(() => {
    if (typeof window === 'undefined') return '';
    const callbackError = new URLSearchParams(window.location.search).get('error');
    return callbackError ? decodeURIComponent(callbackError) : '';
  });

  function redirectUrl() {
    const siteUrl = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : ''));
    // buildOAuthRedirectUrl sanitises the path: junk falls back to /chat.
    const target = next ?? (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null);
    return buildOAuthRedirectUrl(target || '/chat', siteUrl);
  }

  async function handleGoogleSignIn() {
    setLoading('google');
    setError('');
    setMessage('');
    // Intent, not outcome: recorded before the redirect so a drop-off before Google is still visible.
    trackEvent('signin_started', { source: 'google' });

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl(), queryParams: { access_type: 'offline', prompt: 'consent' } },
    });

    if (oauthError) {
      console.error('Google OAuth error:', oauthError);
      setError(
        /provider|google|oauth/i.test(oauthError?.message ?? '')
          ? 'Google sign-in is not available right now. Try again or ask for help in the Discord.'
          : getAuthErrorMessage(oauthError?.code ?? 'generic'),
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
      // bp=email marks the callback as a magic-link arrival so the blueprint merge is counted.
      options: { emailRedirectTo: `${redirectUrl()}&bp=email` },
    });

    if (otpError) {
      console.error('Email sign-in error:', otpError);
      setError(getAuthErrorMessage(otpError?.code ?? 'generic'));
      setLoading(null);
      return;
    }

    setMessage(`Check your inbox. We sent a sign-in link to ${trimmed}. Open it on this device to continue.`);
    setLoading(null);
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading !== null}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-foreground px-4 py-3 font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-background text-xs font-bold text-foreground">G</span>
        Continue with Google
      </button>

      <div className="flex items-center gap-4" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-muted">or</span>
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

      <p className="text-xs leading-relaxed text-muted">
        By continuing you agree to our{' '}
        <Link href="/terms" className="text-ember underline-offset-2 hover:underline">
          terms and privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
