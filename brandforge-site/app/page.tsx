import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFaq } from '@/components/landing/landing-faq';
import { HomeCollaborate, HomeCreate, HomeDistribute, HomeHero, HomePricing } from '@/components/landing/home-sections';
import { SiteFooter } from '@/components/site-footer';
import { listCommunityPosts, listPublicSpecialists, listPublishedPosts } from '@/lib/project-db';

// brandforge.gg: who we are with a way in on the first screen, the three things you do here, what it costs. Real member
// work is read at most every ten minutes, so the page stays fast and cheap to serve.
export const revalidate = 600;

export const metadata: Metadata = pageMeta({
  path: '/',
  title: 'BrandForge: create, distribute, and work with real people',
  description: 'Make launch videos, carousels, ads and articles, post them everywhere, and hire real people when you need them. One chat, read by the BrandForge team. Free to start.',
});

export default async function HomePage() {
  const [posts, published, specialists] = await Promise.all([
    listCommunityPosts('create', 8).catch(() => []),
    listPublishedPosts(6).catch(() => []),
    listPublicSpecialists().catch(() => []),
  ]);
  const creations = posts.map((post) => ({ id: post.id, title: post.title, image: post.image_urls[0] ?? null, video: Boolean(post.video_url) }));
  const recent = published.map((post) => ({ id: post.id, network: post.network, url: post.url, caption: post.caption, thumb: post.thumb_url }));
  const people = specialists.map((person) => ({ handle: person.handle, name: person.display_name, headline: (person as { headline?: string | null }).headline ?? '' }));

  return (
    <div className="bf-page">
      <LandingNav />
      <main>
        <HomeHero />
        <HomeCreate creations={creations} />
        <HomeDistribute published={recent} />
        <HomeCollaborate people={people} />
        <HomePricing />
        <LandingFaq />
      </main>
      <SiteFooter />
    </div>
  );
}
