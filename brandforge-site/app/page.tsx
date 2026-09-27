import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingSections } from '@/components/landing/landing-sections';
import { LandingCommunity } from '@/components/landing/landing-community';
import { BetaBanner } from '@/components/beta-banner';

export const metadata = {
  title: 'BrandForge — Describe it. Humans build it.',
  description:
    'BrandForge turns one conversation into a real project: AI structures your idea, vetted designers, developers, reverse engineers and marketers ship it, escrow protects your money.',
};

export default function Home() {
  return (
    <div className="bf-page">
      <BetaBanner />
      <LandingNav />
      <main>
        <LandingHero />
        <LandingSections />
        <LandingCommunity />
      </main>
      <footer className="border-t border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-[#9aa0a6]">
            <span className="font-serif text-[#ece7de]">
              Brand<span className="text-[#e8571e]">Forge</span>
            </span>
          </p>
          <nav className="flex gap-6 text-sm text-[#9aa0a6]">
            <Link href="/terms" className="transition hover:text-[#ece7de]">
              Terms
            </Link>
            <Link href="/privacy" className="transition hover:text-[#ece7de]">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
