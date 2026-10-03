import Link from 'next/link';
import { COMMUNITY_LINKS } from '@/lib/community';

export type LegalSection = {
  title: string;
  body: string[];
};

/**
 * Shared layout for the legal pages (terms / privacy / refunds).
 * Server component; content is passed in by each page so the copy lives next
 * to its route and stays easy for the founder to review and edit.
 */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-line px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="font-serif text-2xl text-foreground">
            Brand<span className="text-ember">Forge</span>
          </Link>
          <Link href="/" className="text-sm text-muted transition hover:text-foreground">
            ← Back to brandforge.gg
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Legal</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated: {updated}</p>
        <p className="mt-6 text-base leading-relaxed text-muted">{intro}</p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-serif text-xl text-foreground">{section.title}</h2>
              <div className="mt-3 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 48)} className="text-sm leading-relaxed text-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 border-t border-line pt-8">
          <p className="text-sm text-muted">
            Questions about this policy? Message the project manager on{' '}
            <a
              href={COMMUNITY_LINKS.telegramManager.href}
              target="_blank"
              rel="noreferrer"
              className="text-ember transition hover:opacity-90"
            >
              Telegram ({COMMUNITY_LINKS.telegramManager.handle})
            </a>{' '}
            or ask in our{' '}
            <a
              href={COMMUNITY_LINKS.discord.href}
              target="_blank"
              rel="noreferrer"
              className="text-ember transition hover:opacity-90"
            >
              Discord
            </a>
            .
          </p>
          <nav className="mt-6 flex flex-wrap gap-6 text-sm">
            <Link href="/terms" className="text-muted transition hover:text-foreground">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-muted transition hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/refunds" className="text-muted transition hover:text-foreground">
              Refund Policy
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
