import { Suspense } from 'react';
import { ChatWorkspace } from '@/components/chat-workspace';
import { LandingCommunity } from '@/components/landing/landing-community';
import { LandingFaq } from '@/components/landing/landing-faq';
import { LandingProof } from '@/components/landing/landing-proof';
import { OverviewFeatures, OverviewFinal, OverviewHero, OverviewHow, OverviewIdea, OverviewPrice } from '@/components/overview/overview-sections';
import { SiteFooter } from '@/components/site-footer';

// The front door is the product: brandforge.gg opens straight into a chat. Signed-out visitors
// start a guest chat with their first message. Under the chat, the page carries the long-form
// pitch (what it is, how it works, the work, the reviews, the community, the questions).
export const metadata = {
  title: 'BrandForge: AI and people, one workspace',
  description:
    'Make every kind of message and publish it. Trade products, services and requests. AI drafts in seconds; people finish the job. Free to start.',
  alternates: { canonical: '/' },
};

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'BrandForge',
  url: 'https://brandforge.gg',
  description:
    'Workspace where AI and people work together: create and publish every kind of message, and trade products, services and requests, with teams, specialists and milestone contracts.',
  sameAs: ['https://discord.gg/GSKHXkUY85', 'https://t.me/BrandForge_gg', 'https://github.com/BrandForgeGG'],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />
      <Suspense
        fallback={
          <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
            <p className="text-sm text-muted">Loading…</p>
          </main>
        }
      >
        <ChatWorkspace />
      </Suspense>
      <div className="bf-page">
        <OverviewHero compact />
        <OverviewHow />
        <OverviewIdea />
        <OverviewFeatures />
        <OverviewPrice />
        <LandingProof />
        <LandingCommunity />
        <LandingFaq />
        <OverviewFinal />
        <SiteFooter />
      </div>
    </>
  );
}
