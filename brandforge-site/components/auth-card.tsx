'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/funnel-client';
import {
  buildOAuthRedirectUrl,
  getAuthErrorMessage,
  resolveSiteUrl,
} from '@/lib/auth-utils';

export function AuthCard() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    const callbackError = new URLSearchParams(window.location.search).get('error');
    return callbackError ? decodeURIComponent(callbackError) : '';
  });

  async function handleGoogleSignIn() {
    setLoading(true);
    setError('');
    setMessage('');

    // Intent, not outcome: recorded before the OAuth redirect so a drop-off between here and
    // Google is still visible in the funnel.
    trackEvent('signin_started', { source: 'google' });

    const siteUrl = resolveSiteUrl(
      process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== 'undefined' ? window.location.origin : '')
    );
    const redirectUrl = buildOAuthRedirectUrl('/chat', siteUrl);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
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
      setLoading(false);
      return;
    }

    setMessage('Opening Google…');
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1c2024] p-8">
      <div>
        <p className="font-serif text-xl text-[#ece7de]">
          Brand<span className="text-[#e8571e]">Forge</span>
        </p>
        <h1 className="mt-3 font-serif text-3xl text-[#ece7de]">
          Sign in to BrandForge
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#9aa0a6]">
          Continue with Google to open the chat and describe what you want to build.
        </p>
      </div>

      <div className="mt-6 space-y-5">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#ece7de] px-4 py-3 font-semibold text-[#14171a] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#14171a] text-xs font-bold text-[#ece7de]">
            G
          </span>
          Continue with Google
        </button>

        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {message}
          </p>
        ) : null}
      </div>

      <p className="mt-6 text-center text-sm text-[#9aa0a6]">
        Want to work with us?{' '}
        <Link href="/apply" className="font-medium text-[#e8571e]">
          Apply as a specialist
        </Link>
      </p>
    </div>
  );
}
