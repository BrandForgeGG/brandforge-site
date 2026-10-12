import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingCommunity } from '@/components/landing/landing-community';
import { LandingProof } from '@/components/landing/landing-proof';
import { LandingFaq } from '@/components/landing/landing-faq';
import { OverviewFeatures, OverviewFinal, OverviewHero, OverviewHow, OverviewIdea, OverviewPrice } from '@/components/overview/overview-sections';
import { SiteFooter } from '@/components/site-footer';

// brandforge.gg is the landing page: what BrandForge is, with one way in. The app itself, a new chat, is at /chat.
export const metadata: Metadata = pageMeta({
  path: '/',
  title: 'BrandForge: AI and people, one workspace',
  description: 'Make every kind of message and publish it. Trade products, services and requests. AI drafts in seconds; people finish the job. Free to start.',
});

export default function HomePage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main>
        <OverviewHero />
        <OverviewHow />
        <OverviewIdea />
        <OverviewFeatures />
        <OverviewPrice />
        <LandingProof />
        <LandingCommunity />
        <LandingFaq />
        <OverviewFinal />
      </main>
      <SiteFooter />
    </div>
  );
}
