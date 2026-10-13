'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/funnel-client';
import { buildOAuthRedirectUrl, getAuthErrorMessage, isValidEmail, resolveSiteUrl } from '@/lib/auth-utils';

const inputClass = 'w-full rounded-full border border-line bg-background px-5 py-3 text-[15px] text-foreground outline-none transition placeholder:text-muted focus:border-ember focus:ring-1 focus:ring-ember';
const RESEND_AFTER = 45;

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.04 5.04 0 0 1-2.19 3.31v2.75h3.54c2.07-1.91 3.25-4.72 3.25-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.75c-.98.66-2.23 1.05-3.74 1.05-2.87 0-5.3-1.94-6.17-4.55H2.17v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.83 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.17a11 11 0 0 0 0 9.86l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.36c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.17 7.07l3.66 2.84C6.7 7.3 9.13 5.36 12 5.36z" />
    </svg>
  );
}

// The sign-in choices, shared by the /login page and the sign-in pop-up: Google first (one tap), then email. Email sends
// one message with both a link and a 6-digit code, so it works wherever the email is read: open the link in this browser,
// or type the code here. `next` is where the person lands after signing in; without it the form honours ?next=.
export function SignInForm({ next }: { next?: string }) {
  const [view, setView] = useState<'choose' | 'check'>('choose');
  const [loading, setLoading] = useState<'google' | 'email' | 'code' | null>(null);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(() => {
    if (typeof window === 'undefined') return '';
    const callbackError = new URLSearchParams(window.location.search).get('error');
    return callbackError ? decodeURIComponent(callbackError) : '';
  });

  // The resend button counts down instead of letting people trip the email rate limit.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  function target() {
    return next ?? (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null) ?? '/chat';
  }

  function redirectUrl() {
    const siteUrl = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : ''));
    // buildOAuthRedirectUrl sanitises the path: junk falls back to /chat.
    return buildOAuthRedirectUrl(target() || '/chat', siteUrl);
  }

  async function handleGoogle() {
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
      setError(/provider|google|oauth/i.test(oauthError?.message ?? '') ? 'Google sign-in is not available right now. Use your email below, or try again in a moment.' : getAuthErrorMessage(oauthError?.code ?? 'generic'));
      setLoading(null);
      return;
    }
    setMessage('Opening Google…');
  }

  async function sendEmail(address: string) {
    setLoading('email');
    setError('');
    setMessage('');
    trackEvent('signin_started', { source: 'email' });
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: address,
      // bp=email marks the callback as an email arrival so the blueprint merge is counted.
      options: { emailRedirectTo: `${redirectUrl()}&bp=email`, shouldCreateUser: true },
    });
    setLoading(null);
    if (otpError) {
      console.error('Email sign-in error:', otpError);
      setError(otpError.status === 429 ? getAuthErrorMessage('over_email_send_rate_limit') : getAuthErrorMessage(otpError?.code ?? 'generic'));
      return false;
    }
    setSentTo(address);
    setCode('');
    setWait(RESEND_AFTER);
    setView('check');
    return true;
  }

  async function handleEmail(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setError(getAuthErrorMessage('invalid_email'));
      setMessage('');
      return;
    }
    await sendEmail(trimmed);
  }

  async function handleCode(event: React.FormEvent) {
    event.preventDefault();
    const digits = code.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 8) {
      setError('Enter the code from the email. It is 6 digits.');
      return;
    }
    setLoading('code');
    setError('');
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: sentTo, token: digits, type: 'email' });
    if (verifyError) {
      console.error('Email code error:', verifyError);
      setError(/expired/i.test(verifyError.message) ? getAuthErrorMessage('otp_expired') : 'That code did not work. Check it, or send a new one.');
      setLoading(null);
      return;
    }
    setMessage('Signed in. Opening BrandForge…');
    // Signed in already; the callback only runs the first-sign-in steps (welcome, onboarding) and sends them on.
    const finish = new URL('/auth/callback', window.location.origin);
    finish.searchParams.set('finish', '1');
    finish.searchParams.set('bp', 'email');
    finish.searchParams.set('next', target().startsWith('/') ? target() : '/chat');
    window.location.assign(finish.toString());
  }

  const legal = (
    <p className="text-center text-xs leading-relaxed text-muted">
      By continuing you agree to our{' '}
      <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
        Terms
      </Link>{' '}
      and{' '}
      <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
        Privacy Policy
      </Link>
      .
    </p>
  );

  const alerts = (
    <>
      {error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="rounded-xl border border-trust/30 bg-trust/10 px-3 py-2 text-sm text-success">
          {message}
        </p>
      ) : null}
    </>
  );

  if (view === 'check') {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-background px-4 py-3 text-center">
          <p className="text-sm font-semibold text-foreground">Check your email</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            We sent a sign-in email to <span className="break-all text-foreground">{sentTo}</span>. Open the link in it, or type the code here.
          </p>
        </div>
        <form onSubmit={handleCode} className="space-y-3">
          <label htmlFor="auth-code" className="sr-only">
            Code from the email
          </label>
          <input id="auth-code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={10} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} text-center text-lg tracking-[0.3em]`} />
          <button type="submit" disabled={loading !== null} className="w-full rounded-full bg-foreground px-5 py-3 text-[15px] font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
            {loading === 'code' ? 'Checking…' : 'Continue'}
          </button>
        </form>
        {alerts}
        <div className="flex items-center justify-between gap-2 text-sm">
          <button type="button" onClick={() => { setView('choose'); setError(''); setMessage(''); }} className="text-muted underline-offset-2 hover:text-foreground hover:underline">
            Use a different email
          </button>
          <button type="button" disabled={wait > 0 || loading !== null} onClick={() => void sendEmail(sentTo)} className="text-muted underline-offset-2 hover:text-foreground hover:underline disabled:no-underline disabled:opacity-60">
            {wait > 0 ? `Send again in ${wait}s` : loading === 'email' ? 'Sending…' : 'Send again'}
          </button>
        </div>
        <p className="text-center text-xs text-muted">Nothing there? Check spam or promotions, or continue with Google.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void handleGoogle()}
        disabled={loading !== null}
        className="flex w-full items-center gap-3 rounded-full bg-foreground px-5 py-3.5 text-[15px] font-semibold text-background shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
          <GoogleMark />
        </span>
        <span className="flex-1 text-center">{loading === 'google' ? 'Opening Google…' : 'Continue with Google'}</span>
        <span className="w-7" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-4 py-1" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleEmail} className="space-y-3">
        <label htmlFor="auth-email" className="sr-only">
          Email address
        </label>
        <input id="auth-email" type="email" autoComplete="email" inputMode="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        <button type="submit" disabled={loading !== null} className="w-full rounded-full border border-ember bg-ember/10 px-5 py-3 text-[15px] font-semibold text-foreground transition hover:bg-ember/20 disabled:cursor-not-allowed disabled:opacity-60">
          {loading === 'email' ? 'Sending…' : 'Continue with email'}
        </button>
      </form>

      {alerts}
      <div className="pt-1">{legal}</div>
    </div>
  );
}
