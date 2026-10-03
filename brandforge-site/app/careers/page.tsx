import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { COMMUNITY_LINKS } from '@/lib/community';

export const metadata = {
  title: 'Careers — BrandForge',
  description:
    'BrandForge is a small team building a chat-first execution platform. See how we work and how to stay close to what we are hiring for.',
};

export default function CareersPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Careers</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl">
          A small team, shipping in the open
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          BrandForge is built by a handful of designers, developers, and reverse
          engineers. We are not running a public hiring round right now — when that
          changes, it will be announced here first.
        </p>

        <div className="mt-12 space-y-8">
          <section className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="font-serif text-2xl text-foreground">How we work</h2>
            <p className="mt-3 leading-relaxed text-muted">
              Small teams, direct communication, and real delivery over process. We
              ship to production constantly, read our own logs, and let user feedback
              decide the roadmap. If a change has no marketing angle, we say so and
              move on.
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="font-serif text-2xl text-foreground">What we look for</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-muted">
              <li>People who finish things and verify them in production.</li>
              <li>Comfort with ambiguity — the product changes weekly.</li>
              <li>Written communication: our team spans chat, Discord, and Telegram.</li>
              <li>Craft. The details are the product.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="font-serif text-2xl text-foreground">Stay close</h2>
            <p className="mt-3 leading-relaxed text-muted">
              Roles get announced on our channels before anywhere else. Join the
              Discord or the Telegram channel to hear about them — and if you build
              websites, apps, or brands for a living,{' '}
              <Link href="/apply" className="text-ember underline-offset-2 hover:underline">
                apply as a specialist
              </Link>{' '}
              to work on BrandForge projects as part of the operator network.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={COMMUNITY_LINKS.discord.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-95"
              >
                Join Discord
              </a>
              <a
                href={COMMUNITY_LINKS.telegramChannel.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-line px-4 py-2 text-sm text-foreground transition hover:border-ember"
              >
                Telegram channel
              </a>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
