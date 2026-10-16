import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFaq } from '@/components/landing/landing-faq';
import { HomeAiPeople, HomeFinalCta, HomeHero, HomePricing, HomeQuotes, HomeServices, HomeWork, HomeWorkflow } from '@/components/landing/home-sections';
import { SiteFooter } from '@/components/site-footer';
import { listCommunityPosts } from '@/lib/project-db';

// brandforge.gg: people who get work done first, AI second. The one database read (a real AI creation for the people and
// AI section) is refreshed at most every ten minutes, so the page stays fast and cheap to serve.
export const revalidate = 600;

export const metadata: Metadata = pageMeta({
  path: '/',
  title: 'BrandForge: have an idea, we make it happen',
  description: "Designers, developers, marketers and editors, with powerful AI. One accountable team that turns your idea into finished work. Talk to the team first, pay when you agree.",
});

export default async function HomePage() {
  // A real carousel or infographic made with Create, as the AI first draft. Nothing is shown when there is none.
  const posts = await listCommunityPosts('create', 12).catch(() => []);
  const real = posts.find((post) => (post.format === 'carousel' || post.format === 'infographic') && post.image_urls?.[0]);
  const draft = real ? { title: real.title, image: real.image_urls[0], kind: real.format === 'carousel' ? 'carousel' : 'infographic' } : null;

  return (
    <div className="bf-page">
      <LandingNav />
      <main>
        <HomeHero />
        <HomeWork />
        <HomeWorkflow />
        <HomeAiPeople draft={draft} />
        <HomeServices />
        <HomeQuotes />
        <HomePricing />
        <LandingFaq />
        <HomeFinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
