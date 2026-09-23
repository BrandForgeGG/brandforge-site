import { LandingNav } from '@/components/landing/landing-nav';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingSections } from '@/components/landing/landing-sections';
import { LandingCommunity } from '@/components/landing/landing-community';

export const metadata = {
  title: 'BrandForge — Describe it. Humans build it.',
  description:
    'BrandForge turns one conversation into a real project: AI structures your idea, vetted designers, developers, reverse engineers and marketers ship it, escrow protects your money.',
};

export default function Home() {
  return (
    <div className="min-h-screen bg-[#14171a] text-[#ece7de]">
      <LandingNav />
      <main>
        <LandingHero />
        <LandingSections />
        <LandingCommunity />
      </main>
    </div>
  );
}
