'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/funnel-client';
import { buildOAuthRedirectUrl, getAuthErrorMessage, isValidEmail, resolveSiteUrl } from '@/lib/auth-utils';
import { maskPhone, normalizeCode, normalizePhone } from '@/lib/phone.js';

// Which sign-in methods the project has switched on. Google and email are always offered; Apple and phone appear only when
// Supabase says they are enabled, so a button is never a dead end. Read once per page load.
type Methods = { apple: boolean; phone: boolean };
let methodsPromise: Promise<Methods> | null = null;

function loadMethods(): Promise<Methods> {
  if (!methodsPromise) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    methodsPromise = base && key
      ? fetch(`${base}/auth/v1/settings`, { headers: { apikey: key } })
          .then((res) => (res.ok ? res.json() : null))
          .then((json: { external?: { apple?: boolean; phone?: boolean } } | null) => ({ apple: Boolean(json?.external?.apple), phone: Boolean(json?.external?.phone) }))
          .catch(() => ({ apple: false, phone: false }))
      : Promise.resolve({ apple: false, phone: false });
  }
  return methodsPromise;
}

const choice =
  'flex w-full items-center gap-3 rounded-full border border-line bg-background px-5 py-3 text-[15px] font-medium text-foreground transition hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember disabled:cursor-not-allowed disabled:opacity-60';
const inputClass = 'w-full rounded-full border border-line bg-background px-5 py-3 text-[15px] text-foreground outline-none transition placeholder:text-muted focus:border-ember focus:ring-1 focus:ring-ember';
const primary = 'w-full rounded-full bg-foreground px-5 py-3 text-[15px] font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60';

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

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M16.37 1.43c0 1.14-.46 2.2-1.2 2.98-.8.85-2.1 1.5-3.15 1.42-.13-1.1.4-2.25 1.12-2.98.8-.83 2.2-1.45 3.23-1.42zM20.5 17.3c-.55 1.27-.82 1.84-1.53 2.96-1 1.56-2.4 3.5-4.14 3.52-1.55.02-1.95-1-4.05-.99-2.1.01-2.54 1.01-4.09.99-1.74-.02-3.07-1.77-4.07-3.33C-.2 16.1-.5 10.9 1.2 8.3c1.2-1.85 3.1-2.93 4.88-2.93 1.82 0 2.96 1 4.46 1 1.46 0 2.35-1 4.45-1 1.58 0 3.26.86 4.46 2.35-3.92 2.15-3.28 7.75.55 9.58z" />
    </svg>
  );
}

function PhoneMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  );
}

type View = 'choose' | 'phone' | 'code';

// The sign-in choices, shared by the /login page and the sign-in pop-up. `next` is where the person lands after signing in;
// without it the form honours ?next= in the address.
export function SignInForm({ next }: { next?: string }) {
  const [methods, setMethods] = useState<Methods>({ apple: false, phone: false });
  const [view, setView] = useState<View>('choose');
  const [loading, setLoading] = useState<'google' | 'apple' | 'email' | 'phone' | 'code' | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(() => {
    if (typeof window === 'undefined') return '';
    const callbackError = new URLSearchParams(window.location.search).get('error');
    return callbackError ? decodeURIComponent(callbackError) : '';
  });

  useEffect(() => {
    let alive = true;
    void loadMethods().then((found) => {
      if (alive) setMethods(found);
    });
    return () => {
      alive = false;
    };
  }, []);

  function target() {
    return next ?? (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null) ?? '/chat';
  }

  function redirectUrl() {
    const siteUrl = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : ''));
    // buildOAuthRedirectUrl sanitises the path: junk falls back to /chat.
    return buildOAuthRedirectUrl(target() || '/chat', siteUrl);
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setLoading(provider);
    setError('');
    setMessage('');
    // Intent, not outcome: recorded before the redirect so a drop-off before the provider is still visible.
    trackEvent('signin_started', { source: provider });

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectUrl(), ...(provider === 'google' ? { queryParams: { access_type: 'offline', prompt: 'consent' } } : {}) },
    });

    if (oauthError) {
      console.error(`${provider} OAuth error:`, oauthError);
      const name = provider === 'google' ? 'Google' : 'Apple';
      setError(/provider|google|apple|oauth/i.test(oauthError?.message ?? '') ? `${name} sign-in is not available right now. Try another way or ask for help in the Discord.` : getAuthErrorMessage(oauthError?.code ?? 'generic'));
      setLoading(null);
      return;
    }
    setMessage(`Opening ${provider === 'google' ? 'Google' : 'Apple'}…`);
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

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError('Enter your number with the country code, like +971 50 123 4567.');
      return;
    }
    setLoading('phone');
    setError('');
    trackEvent('signin_started', { source: 'phone' });
    const { error: smsError } = await supabase.auth.signInWithOtp({ phone: normalized });
    setLoading(null);
    if (smsError) {
      console.error('Phone sign-in error:', smsError);
      setError(smsError.status === 429 ? 'Too many tries. Wait a minute and try again.' : 'We could not text that number. Check it and try again.');
      return;
    }
    setSentTo(normalized);
    setCode('');
    setView('code');
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    const digits = normalizeCode(code);
    if (!digits) {
      setError('Enter the 6-digit code from the text message.');
      return;
    }
    setLoading('code');
    setError('');
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone: sentTo, token: digits, type: 'sms' });
    if (verifyError) {
      console.error('Phone code error:', verifyError);
      setError('That code did not work. Check it, or go back and get a new one.');
      setLoading(null);
      return;
    }
    setMessage('Signed in. Opening BrandForge…');
    // A full load, so every part of the page starts out signed in.
    window.location.assign(target().startsWith('/') ? target() : '/chat');
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

  if (view === 'phone' || view === 'code') {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => { setView('choose'); setError(''); setMessage(''); }} className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
          <span aria-hidden="true">←</span> Back
        </button>
        {view === 'phone' ? (
          <form onSubmit={sendCode} className="space-y-3">
            <label htmlFor="auth-phone" className="block text-sm text-muted">
              Your phone number
            </label>
            <input id="auth-phone" type="tel" inputMode="tel" autoComplete="tel" autoFocus placeholder="+971 50 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            <p className="text-xs text-muted">Start with the country code. We text you a 6-digit code. Message and data rates may apply.</p>
            <button type="submit" disabled={loading !== null} className={primary}>
              {loading === 'phone' ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-3">
            <label htmlFor="auth-code" className="block text-sm text-muted">
              Enter the code we texted to {maskPhone(sentTo)}
            </label>
            <input id="auth-code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={9} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} text-center text-lg tracking-[0.35em]`} />
            <button type="submit" disabled={loading !== null} className={primary}>
              {loading === 'code' ? 'Checking…' : 'Continue'}
            </button>
            <button type="button" onClick={() => { setView('phone'); setError(''); }} className="block w-full text-center text-sm text-muted underline-offset-2 hover:text-foreground hover:underline">
              Use a different number or send a new code
            </button>
          </form>
        )}
        {alerts}
        {legal}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => void handleOAuth('google')} disabled={loading !== null} className={choice}>
        <GoogleMark />
        <span className="flex-1 text-center">Continue with Google</span>
      </button>
      {methods.apple ? (
        <button type="button" onClick={() => void handleOAuth('apple')} disabled={loading !== null} className={choice}>
          <AppleMark />
          <span className="flex-1 text-center">Continue with Apple</span>
        </button>
      ) : null}
      {methods.phone ? (
        <button type="button" onClick={() => { setView('phone'); setError(''); setMessage(''); }} disabled={loading !== null} className={choice}>
          <PhoneMark />
          <span className="flex-1 text-center">Continue with phone</span>
        </button>
      ) : null}

      <div className="flex items-center gap-4 py-1" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleEmailSignIn} className="space-y-3">
        <label htmlFor="auth-email" className="sr-only">
          Email address
        </label>
        <input id="auth-email" type="email" autoComplete="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        <button type="submit" disabled={loading !== null} className={primary}>
          {loading === 'email' ? 'Sending…' : 'Continue'}
        </button>
      </form>

      {alerts}
      <div className="pt-1">{legal}</div>
    </div>
  );
}
