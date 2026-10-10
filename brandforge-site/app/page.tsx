import { LandingNav } from '@/components/landing/landing-nav';
import { LandingCommunity } from '@/components/landing/landing-community';
import { LandingProof } from '@/components/landing/landing-proof';
import { LandingFaq } from '@/components/landing/landing-faq';
import { OverviewFeatures, OverviewFinal, OverviewHero, OverviewHow, OverviewIdea, OverviewPrice } from '@/components/overview/overview-sections';
import { SiteFooter } from '@/components/site-footer';

// brandforge.gg is the landing page: what BrandForge is, with one way in. The app itself, a new chat, is at /chat.
export const metadata = {
  title: 'BrandForge: AI and people, one workspace',
  description:
    'Make every kind of message and publish it. Trade products, services and requests. AI drafts in seconds; people finish the job. Free to start.',
  alternates: { canonical: '/' },
};

export default function HomePage() {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BrandForge',
    url: 'https://brandforge.gg',
    description:
      'Workspace where AI and people work together: create and publish every kind of message, and trade products, services and requests, with teams, specialists and milestone contracts.',
    sameAs: ['https://discord.gg/GSKHXkUY85', 'https://t.me/BrandForge_gg', 'https://github.com/BrandForgeGG'],
  };
  return (
    <div className="bf-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />
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
