import Link from 'next/link';
import { COMMUNITY_LINKS } from '@/lib/community';
import { SOCIAL_LINKS } from '@/lib/social-links';

// Short on purpose: the product links on one line, the small print and socials on the next.
const PRODUCT: { label: string; href: string }[] = [
  { label: 'How it works', href: '/#how' },
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Trade', href: '/trade' },
  { label: 'Work', href: '/work' },
  { label: 'Specialists', href: '/specialists' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
  { label: 'Careers', href: '/careers' },
];

const SMALL_PRINT: { label: string; href: string; external?: boolean }[] = [
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Refunds', href: '/refunds' },
  { label: 'Discord', href: COMMUNITY_LINKS.discord.href, external: true },
  { label: 'Telegram', href: COMMUNITY_LINKS.telegramGroup.href, external: true },
];

const link = 'inline-flex min-h-9 items-center text-muted transition hover:text-foreground';

export function SiteFooter() {
  return (
    <footer className="border-t border-line px-6 py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <Link href="/" className="font-serif text-lg text-foreground" aria-label="BrandForge home">
            Brand<span className="text-ember">Forge</span>
          </Link>
          <nav aria-label="Product" className="flex flex-wrap items-center gap-x-5">
            {PRODUCT.map((item) => (
              <Link key={item.href} href={item.href} className={link}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs">
          <p className="text-muted">
            © 2026 BrandForge
            {SMALL_PRINT.map((item) =>
              item.external ? (
                <span key={item.label}>
                  <span aria-hidden="true"> · </span>
                  <a href={item.href} target="_blank" rel="noopener noreferrer" className="transition hover:text-foreground">
                    {item.label}
                  </a>
                </span>
              ) : (
                <span key={item.label}>
                  <span aria-hidden="true"> · </span>
                  <Link href={item.href} className="transition hover:text-foreground">
                    {item.label}
                  </Link>
                </span>
              ),
            )}
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
