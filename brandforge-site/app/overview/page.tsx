import { LandingNav } from '@/components/landing/landing-nav';
import { LandingCommunity } from '@/components/landing/landing-community';
import { LandingProof } from '@/components/landing/landing-proof';
import { LandingFaq } from '@/components/landing/landing-faq';
import { OverviewFeatures, OverviewFinal, OverviewHero, OverviewHow, OverviewIdea, OverviewPrice } from '@/components/overview/overview-sections';
import { SiteFooter } from '@/components/site-footer';

export const metadata = {
  title: 'BrandForge overview: AI and people, one workspace',
  description:
    'AI and people, one workspace. Create and publish every kind of message, and trade products, services and requests. AI drafts in seconds; people finish the job.',
  alternates: { canonical: '/overview' },
};

export default function OverviewPage() {
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
