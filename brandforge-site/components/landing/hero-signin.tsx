'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSessionUser } from '@/lib/browser-auth';
import { SignInForm } from '@/components/sign-in-form';

// The sign-up card on the front page: Google in one tap, or an email code. Someone already signed in gets a way back in.
export function HeroSignIn() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void getSessionUser()
      .then((user) => live && setSignedIn(Boolean(user)))
      .catch(() => live && setSignedIn(false));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="w-full rounded-3xl border border-line bg-panel p-6 shadow-[var(--shadow-soft)] sm:p-8">
      {signedIn ? (
        <div className="space-y-4 text-center">
          <p className="font-serif text-2xl text-foreground">Welcome back</p>
          <p className="text-sm text-muted">Your chats, creations and channels are where you left them.</p>
          <Link href="/chat" className="block rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-on-ember transition hover:opacity-90">
            Open BrandForge
          </Link>
        </div>
      ) : (
        <>
          <p className="font-serif text-2xl text-foreground">Start free</p>
          <p className="mt-1 text-sm text-muted">One tap with Google, or a code by email. No card.</p>
          <div className="mt-5">
            <SignInForm next="/chat" />
          </div>
        </>
      )}
    </div>
  );
}
