'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchAuthed } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';
import { COMMUNITY_LINKS } from '@/lib/community';

const SUGGESTIONS = [
  'A booking site for my salon',
  'A SaaS that lets restaurants manage reservations',
  'An app for my fitness business',
  'A dashboard for support tickets',
];

const PACKAGES = [
  { key: 'launch', name: 'Launch', desc: 'Get it into the world.', items: ['Websites', 'Landing pages', 'Brand systems', 'Prototypes'], price: '€500+' },
  { key: 'build', name: 'Build', desc: 'Turn the idea into a working product.', items: ['SaaS', 'Web apps', 'Bots & automation', 'AI integrations'], price: '€1,500+' },
  { key: 'product', name: 'Product', desc: 'Build the real thing.', items: ['Mobile apps', 'Marketplaces', 'Complex platforms', 'Custom software'], price: '€3,000+' },
  { key: 'scale', name: 'Scale', desc: 'Keep building after launch.', items: ['Features', 'AI', 'Automation', 'Growth'], price: 'Custom' },
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

    trackEvent('chat_started', { source: 'landing_hero' });

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      try {
        window.sessionStorage.setItem('brandforge:pending-message', trimmed);
      } catch {}
      setBusy(false);
      setIsSignedOut(true);
      setNotice('Sign in with Google first — your idea becomes a project once you are in.');
      return;
    }

    try {
      const response = await fetchAuthed('/api/conversations', {
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

  function startPackage(pkg: (typeof PACKAGES)[number]) {
    const idea = `I'm interested in ${pkg.name.toLowerCase()} — specifically ${pkg.items[0]?.toLowerCase()}.`;
    setInput(idea);
    if (isSignedOut) setIsSignedOut(false);
  }

  return (
    <section className="px-6 pb-16 pt-14 sm:pt-20" aria-labelledby="hero-title">
      <div className="mx-auto w-full max-w-3xl text-center">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-xs text-muted">
          AI plans. Humans build. BrandForge runs the project.
        </p>

        <h1 id="hero-title" className="font-serif text-5xl leading-[1.05] text-foreground sm:text-7xl">
          Bring the idea.
          <br />
          <span className="text-ember">We build the team.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
          Tell BrandForge what you&apos;re trying to create. AI structures the project,
          vetted specialists build it, and you approve every step.
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-muted">
          {['Website', 'SaaS', 'App', 'Automation', 'AI', 'Custom Software'].map((niche) => (
            <span key={niche} className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-1 rounded-full bg-ember" />
              {niche}
            </span>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mx-auto mt-7 max-w-xl">
          <div className="relative">
            <textarea
              value={input}
              aria-label="Describe your project"
              onChange={(e) => setInput(e.target.value)}
              placeholder="What are you trying to build?"
              rows={3}
              className="w-full resize-none rounded-2xl border border-line bg-panel px-5 py-4 text-base text-foreground placeholder-muted outline-none transition focus:border-ember focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="absolute bottom-4 right-4 rounded-lg bg-ember px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Describe your project →'}
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

        <p className="mt-5 text-sm text-muted">
          No freelancer hunting. No juggling five people.{' '}
          <span className="text-foreground">One project. One accountable team.</span>
        </p>

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

        <div className="mt-14">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Our packages</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PACKAGES.map((pkg) => (
              <button
                key={pkg.key}
                type="button"
                onClick={() => startPackage(pkg)}
                className="group rounded-2xl border border-line bg-panel p-5 text-left transition hover:border-ember"
              >
                <p className="font-serif text-lg text-foreground">{pkg.name}</p>
                <p className="mt-1 text-xs text-muted">{pkg.desc}</p>
                <p className="mt-3 text-sm font-semibold text-ember">{pkg.price}</p>
                <div className="mt-3 space-y-1">
                  {pkg.items.map((item) => (
                    <p key={item} className="text-xs text-muted">{item}</p>
                  ))}
                </div>
                <p className="mt-4 text-xs text-ember opacity-0 transition group-hover:opacity-100">
                  Explore {pkg.name} →
                </p>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Not sure? Just describe it. We&apos;ll figure out the scope with you.
          </p>
        </div>
      </div>
    </section>
  );
}
