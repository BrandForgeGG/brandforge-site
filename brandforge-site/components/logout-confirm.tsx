'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSessionUser } from '@/lib/browser-auth';
import { clearAccountLocalState } from '@/lib/account-local';

// "Log out of BrandForge?": the page every Log out button leads to. It shows who is signed in, signs out only on the second
// tap, and always offers a way back. Signed-out visitors who land here are sent on to the front page.
export function LogoutConfirm() {
  const router = useRouter();
  const [who, setWho] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getSessionUser()
      .then((user) => {
        if (!alive) return;
        setWho(user ? (user.email ?? user.phone ?? 'your account') : null);
      })
      .catch(() => alive && setWho(null));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (who === null) router.replace('/');
  }, [who, router]);

  async function logOut() {
    setBusy(true);
    clearAccountLocalState();
    await supabase.auth.signOut().catch(() => undefined);
    // A full load, so nothing from the signed-in page stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload clears every in-memory cache
    window.location.assign('/');
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="bf-login-panel w-full max-w-[26rem] rounded-3xl border border-line bg-panel px-6 pb-6 pt-8 text-center shadow-2xl sm:px-8">
        <Link href="/" className="font-serif text-xl text-foreground" aria-label="BrandForge home">
          Brand<span className="text-ember">Forge</span>
        </Link>
        <h1 className="mt-5 font-serif text-[1.65rem] leading-tight tracking-[-0.02em]">Log out of BrandForge?</h1>
        {who === undefined || who === null ? (
          <div className="bf-skeleton mx-auto mt-3 h-4 w-48 rounded bg-overlay" aria-hidden="true" />
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            You are signed in as <span className="break-all text-foreground">{who}</span>. Your chats and projects stay saved for when you come back.
          </p>
        )}
        <div className="mt-7 space-y-3">
          <button type="button" onClick={() => void logOut()} disabled={busy || !who} className="w-full rounded-full bg-foreground px-5 py-3 text-[15px] font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? 'Logging out…' : 'Log out'}
          </button>
          <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push('/chat'))} disabled={busy} className="w-full rounded-full border border-line bg-background px-5 py-3 text-[15px] font-medium text-foreground transition hover:bg-overlay disabled:opacity-60">
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
