import { Suspense } from 'react';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingPillars } from '@/components/landing/landing-pillars';
import { LandingCommunity } from '@/components/landing/landing-community';
import { LandingProof } from '@/components/landing/landing-proof';
import { BetaBanner } from '@/components/beta-banner';
import { SiteFooter } from '@/components/site-footer';

export const metadata = {
  title: 'BrandForge — Research, plan, create and distribute with your team',
  description:
    'Describe an idea, paste a URL or drop a file. BrandForge researches it, plans it, creates the assets and distributes them, with your team in the same chat.',
  alternates: { canonical: '/' },
};

export default function Home() {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BrandForge',
    url: 'https://brandforge.gg',
    description:
      'Workspace for founders and teams: AI researches and plans, you create and distribute together, vetted specialists build with escrow-protected payments.',
    sameAs: [
      'https://discord.gg/GSKHXkUY85',
      'https://t.me/BrandForge_gg',
      'https://github.com/BrandForgeGG',
    ],
  };
  return (
    <div className="bf-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <BetaBanner />
      <LandingNav />
      <main>
        <Suspense>
          <LandingHero />
        </Suspense>
        <LandingPillars />
        <LandingProof />
        <LandingCommunity />
      </main>
      <SiteFooter />
    </div>
  );
}
