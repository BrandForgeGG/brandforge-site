import Link from 'next/link';
import { COMMUNITY_LINKS } from '@/lib/community';
import { SOCIAL_LINKS } from '@/lib/social-links';

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Platform', href: '/platform' },
      { label: 'Blog', href: '/blog' },
      { label: 'Open the app', href: '/chat' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Company', href: '/about' },
      { label: 'Careers', href: '/careers' },
      { label: 'Apply as a specialist', href: '/apply' },
    ],
  },
  {
    title: 'Policies',
    links: [
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Refund Policy', href: '/refunds' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Discord', href: COMMUNITY_LINKS.discord.href, external: true },
      { label: 'Telegram channel', href: COMMUNITY_LINKS.telegramChannel.href, external: true },
      { label: 'Telegram group', href: COMMUNITY_LINKS.telegramGroup.href, external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-panel/40 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <p className="font-serif text-xl text-foreground">
              Brand<span className="text-ember">Forge</span>
            </p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Describe it in chat. Get a vetted team, a priced proposal, and escrow-protected
              delivery.
            </p>
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Social media">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-ember hover:text-foreground"
                >
                  {social.label}
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted">{column.title}</p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center text-sm text-muted transition hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="inline-flex min-h-9 items-center text-sm text-muted transition hover:text-foreground">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          <p className="text-xs text-muted">© 2026 BrandForge. All rights reserved.</p>
          <p className="text-xs text-muted">brandforge.gg</p>
        </div>
      </div>
    </footer>
  );
}
