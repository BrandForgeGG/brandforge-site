import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFaq } from '@/components/landing/landing-faq';
import { HomeDiy, HomeHero, HomePricing, HomeQuotes, HomeSteps } from '@/components/landing/home-sections';
import { SiteFooter } from '@/components/site-footer';

// brandforge.gg for a buyer: what you get, proof the team delivers, what happens when you pay, the price.
export const revalidate = 600;

export const metadata: Metadata = pageMeta({
  path: '/',
  title: 'BrandForge: a full growth team for less than one hire',
  description: "Development, design, video and marketing by real people, 1, 2 or 3 tasks at a time. From €690/mo. If month one isn't delivered, you get a full refund.",
});

export default function HomePage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main>
        <HomeHero />
        <HomeSteps />
        <HomeQuotes />
        <HomePricing />
        <HomeDiy />
        <LandingFaq />
      </main>
      <SiteFooter />
    </div>
  );
}
