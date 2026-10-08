import { LandingNav } from '@/components/landing/landing-nav';
import { LandingCommunity } from '@/components/landing/landing-community';
import { LandingProof } from '@/components/landing/landing-proof';
import { LandingFaq } from '@/components/landing/landing-faq';
import { OverviewFeatures, OverviewFinal, OverviewHero, OverviewHow, OverviewPrice, OverviewThemes } from '@/components/overview/overview-sections';
import { SiteFooter } from '@/components/site-footer';

export const metadata = {
  title: 'BrandForge overview: AI and people, one workspace',
  description:
    'Describe an idea, paste a URL or drop a file. AI researches, plans and creates; your team and vetted specialists finish it in the same chat.',
  alternates: { canonical: '/overview' },
};

export default function OverviewPage() {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BrandForge',
    url: 'https://brandforge.gg',
    description:
      'Workspace where AI drafts and people finish: research, plans, images, ads and video in one chat, with teams, specialists and milestone contracts.',
    sameAs: ['https://discord.gg/GSKHXkUY85', 'https://t.me/BrandForge_gg', 'https://github.com/BrandForgeGG'],
  };
  return (
    <div className="bf-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />
      <LandingNav />
      <main>
        <OverviewHero />
        <OverviewHow />
        <OverviewFeatures />
        <OverviewThemes />
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
