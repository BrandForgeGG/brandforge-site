import Link from 'next/link';
import { COMMUNITY_LINKS } from '@/lib/community';
import { SOCIAL_LINKS } from '@/lib/social-links';
import { CookieSettingsLink } from '@/components/cookie-consent';

// The footer: the brand and its one-line promise, four short columns, then the small print and where to follow us.
type Item = { label: string; href: string; external?: boolean };

const COLUMNS: { title: string; items: Item[] }[] = [
  {
    title: 'Product',
    items: [
      { label: 'Create', href: '/create' },
      { label: 'Distribute', href: '/distribute' },
      { label: 'Trade', href: '/trade' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'The BrandForge team', href: '/specialists' },
      { label: 'Work we shipped', href: '/work' },
      { label: 'Join the team', href: '/apply' },
      { label: 'Careers', href: '/careers' },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'About', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'Explore', href: '/explore' },
    ],
  },
  {
    title: 'Talk to us',
    items: [
      { label: 'Start a chat', href: '/chat' },
      { label: 'Discord', href: COMMUNITY_LINKS.discord.href, external: true },
      { label: 'Telegram', href: COMMUNITY_LINKS.telegramGroup.href, external: true },
    ],
  },
];

const LEGAL: Item[] = [
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Refunds', href: '/refunds' },
];

const link = 'inline-flex min-h-8 items-center text-muted transition hover:text-foreground';

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-deep/40 px-5 pb-8 pt-14 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]">
          <div className="max-w-xs">
            <Link href="/" className="font-serif text-2xl text-foreground" aria-label="BrandForge home">
              Brand<span className="text-ember">Forge</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-muted">Create, publish and work with real people, in one chat read by the BrandForge team.</p>
            <Link href="/chat" className="mt-5 inline-flex rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-on-ember transition hover:opacity-90">
              Start free
            </Link>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">{column.title}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {column.items.map((item) => (
                  <li key={item.label}>
                    {item.external ? (
                      <a href={item.href} target="_blank" rel="noopener noreferrer" className={link}>
                        {item.label}
                      </a>
                    ) : (
                      <Link href={item.href} className={link}>
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
            <span>&copy; 2026 BrandForge</span>
            {LEGAL.map((item) => (
              <Link key={item.label} href={item.href} className="bf-tap transition hover:text-foreground">
                {item.label}
              </Link>
            ))}
            <CookieSettingsLink className="bf-tap transition hover:text-foreground" />
          </p>
          <nav aria-label="Social media" className="flex flex-wrap items-center gap-x-4">
            {SOCIAL_LINKS.map((social) => (
              <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center text-muted transition hover:text-foreground">
                {social.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
