import { Suspense } from 'react';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingSections } from '@/components/landing/landing-sections';
import { LandingFaq } from '@/components/landing/landing-faq';
import { LandingCommunity } from '@/components/landing/landing-community';
import { LandingAiFlow } from '@/components/landing/landing-ai-flow';
import { LandingProof } from '@/components/landing/landing-proof';
import { BetaBanner } from '@/components/beta-banner';
import { SiteFooter } from '@/components/site-footer';

export const metadata = {
  title: 'BrandForge — Turn an idea into something real',
  description:
    'BrandForge combines AI planning with human execution — describe your project, get a vetted team, and ship with escrow protection.',
};

export default function Home() {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BrandForge',
    url: 'https://brandforge.gg',
    description:
      'Execution platform: describe your project, AI structures it, vetted specialists build it, escrow protects your money.',
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
        <LandingAiFlow />
        <LandingSections />
        <LandingProof />
        <LandingFaq />
        <LandingCommunity />
      </main>
      <SiteFooter />
    </div>
  );
}
