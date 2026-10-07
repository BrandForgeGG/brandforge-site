'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchAuthed } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';
import { COMMUNITY_LINKS } from '@/lib/community';

const SUGGESTIONS = [
  'Audit my landing page: https://',
  'Launch plan for my SaaS',
  'Ads for my online store',
  'A booking site for my salon',
];

const PACKAGES = [
  { key: 'launch', name: 'Launch', items: ['Websites'] },
  { key: 'build', name: 'Build', items: ['SaaS'] },
  { key: 'product', name: 'Product', items: ['Mobile apps'] },
  { key: 'scale', name: 'Scale', items: ['Features'] },
] as const;

export function LandingHero() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [input, setInput] = useState(() => {
    const pkg = searchParams.get('pkg');
    if (!pkg) return '';
    const match = PACKAGES.find((p) => p.key === pkg);
    return match ? `I'm interested in ${match.name.toLowerCase()} — ${match.items[0]?.toLowerCase()}` : '';
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [isSignedOut, setIsSignedOut] = useState(false);

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

    const { data: { session } } = await supabase.auth.getSession();

    trackEvent('chat_started', { source: 'landing_hero' });

    try {
      const response = await fetchAuthed('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Signed-out visitors start a guest chat right here: no wall before the first answer.
        body: JSON.stringify({ initialMessage: trimmed, source: 'landing_hero', guest: !session?.user }),
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
    <section className="px-6 pb-12 pt-12 sm:pt-16" aria-labelledby="hero-title">
      <div className="mx-auto w-full max-w-3xl text-center">
        <p className="mb-4 inline-flex items-center rounded-full border border-line px-3 py-1 text-xs text-muted">
          Research. Plan. Create. Distribute.
        </p>

        <h1 id="hero-title" className="font-serif text-4xl leading-[1.08] text-foreground sm:text-6xl">
          Bring the idea.
          <br />
          <span className="text-ember">Ship it with a team.</span>
        </h1>

        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted">
          Describe it, paste a URL or drop a file. AI researches and plans it, then your team builds, creates and distributes it together.
        </p>

        <form onSubmit={handleSubmit} className="mx-auto mt-7 max-w-xl">
          <div className="relative">
            <textarea
              value={input}
              aria-label="Describe your project"
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe your idea, paste a URL, or drop a file…"
              rows={3}
              className="w-full resize-none rounded-2xl border border-line bg-panel px-5 py-4 text-base text-foreground placeholder-muted outline-none transition focus:border-ember focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="absolute bottom-4 right-4 rounded-lg bg-ember px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Start →'}
            </button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setInput(prompt)}
              className="inline-flex min-h-9 items-center rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-ember hover:text-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>

        {notice ? (
          <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-ember/30 bg-ember/10 p-5" role={isSignedOut ? 'status' : 'alert'}>
            <p className="text-sm leading-relaxed text-ember-light">{notice}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={COMMUNITY_LINKS.discord.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-95"
              >
                Open Discord
              </a>
              <a
                href={COMMUNITY_LINKS.telegramGroup.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-line bg-background px-4 py-2 text-sm text-foreground transition hover:border-ember"
              >
                Open Telegram
              </a>
              <a
                href="/login"
                className="rounded-xl border border-line px-4 py-2 text-sm text-muted transition hover:border-ember hover:text-foreground"
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
