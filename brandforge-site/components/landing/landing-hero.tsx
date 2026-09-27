'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/funnel-client';
import { COMMUNITY_LINKS } from '@/lib/community';

const SUGGESTIONS = [
  'Build a website',
  'Build an app',
  'Launch a SaaS',
  'Automate my business',
  'Build an AI product',
  'Grow my business',
  'I have an idea',
];

export function LandingHero() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [isSignedOut, setIsSignedOut] = useState(false);

  // One landing view per mount, recorded client-side because the landing page is public and most
  // visitors are not signed in (the API records signed_in: false for them). This lives in the hero
  // rather than app/page.tsx because that page must stay a Server Component to export `metadata`.
  useEffect(() => {
    trackEvent('landing_viewed');
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setNotice('');
    setIsSignedOut(false);

    // The hero composer is the primary conversion path, so intent is recorded even when the
    // visitor turns out not to be signed in yet.
    trackEvent('chat_started', { source: 'landing_hero' });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      // Local session empty — do not force /login here; middleware handles auth.
      // A transient getSession miss was bouncing signed-in users to login.
      setBusy(false);
      setIsSignedOut(true);
      setNotice('Sign in with Google first — your idea becomes a project once you are in.');
      setTimeout(() => router.push('/login'), 1200);
      return;
    }

    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialMessage: trimmed }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.conversationId) {
        throw new Error(data.error || 'Could not start your project');
      }

      router.push(`/chat?conversationId=${data.conversationId}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start your project');
      setBusy(false);
    }
  }

  return (
    <section className="px-6 pb-16 pt-16 sm:pt-24" aria-labelledby="hero-title">
      <div className="mx-auto w-full max-w-3xl">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e8571e]/30 bg-[#e8571e]/10 px-4 py-1.5 text-xs font-medium text-[#f6d6c3]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#e8571e]" />
          One chat · one project · humans ship it
        </p>

        <h1 id="hero-title" className="font-serif text-4xl leading-[1.1] text-[#ece7de] sm:text-6xl">
          Describe it.
          <br />
          Humans build it.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#9aa0a6]">
          Type what you want to build. BrandForge structures it into requirements, and designers,
          developers, reverse engineers and marketers ship it — with your crypto payment verified
          on-chain and held in escrow until you approve the work.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          {SUGGESTIONS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setInput(prompt)}
              className="rounded-full border border-white/10 bg-[#1c2024] px-4 py-2 text-sm text-[#ece7de] transition hover:border-[#e8571e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6a07a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#14171a]"
            >
              {prompt}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What do you want to build?"
              rows={4}
              className="w-full resize-none rounded-2xl border border-white/10 bg-[#1c2024] px-5 py-4 text-base text-[#ece7de] placeholder-[#6f757b] outline-none transition focus:border-[#e8571e] focus-visible:ring-2 focus-visible:ring-[#f6a07a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#14171a]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="absolute bottom-4 right-4 rounded-lg bg-[#e8571e] px-5 py-2 text-sm font-semibold text-[#14171a] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6a07a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c2024] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Start →'}
            </button>
          </div>
        </form>

        {notice ? (
          <div className="mt-4 rounded-2xl border border-[#e8571e]/30 bg-[#e8571e]/10 p-5" role={isSignedOut ? 'status' : 'alert'}>
            <p className="text-sm leading-relaxed text-[#f6d6c3]">{notice}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={COMMUNITY_LINKS.discord.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[#e8571e] px-4 py-2 text-sm font-semibold text-[#14171a] transition hover:opacity-95"
              >
                Open Discord
              </a>
              <a
                href={COMMUNITY_LINKS.telegramGroup.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-white/10 bg-[#14171a] px-4 py-2 text-sm text-[#ece7de] transition hover:border-[#e8571e]"
              >
                Open Telegram
              </a>
              <a
                href="/login"
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-[#9aa0a6] transition hover:border-[#e8571e] hover:text-[#ece7de]"
              >
                Sign in
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
