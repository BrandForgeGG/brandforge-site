import { LandingNav } from '@/components/landing/landing-nav';
import { RetainerPlans } from '@/components/retainer-plans';
import { PricingPlans } from '@/components/pricing-plans';
import { LandingPackages } from '@/components/landing/landing-packages';
import { LandingSections } from '@/components/landing/landing-sections';
import { LandingFaq } from '@/components/landing/landing-faq';
import { SiteFooter } from '@/components/site-footer';

export const metadata = {
  alternates: { canonical: '/pricing' },
  title: 'Pricing: the BrandForge team by the month, or one project at a time',
  description:
    'Plans from €490 a month: a BrandForge team member and AI deliver your content, ads or product work. Or hire for one project at a fixed price. Free tools included.',
};

export default function PricingPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main>
        <header className="px-6 pb-2 pt-14 text-center">
          <h1 className="mx-auto max-w-3xl font-serif text-4xl text-foreground sm:text-5xl" style={{ textWrap: 'balance' }}>
            Pay for results, not for tools.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted">
            AI makes the first draft in seconds and a person makes it good. Take that as a monthly team, as one fixed-price project, or just use the free tools.
          </p>
        </header>
        <RetainerPlans />
        <section className="border-t border-line px-6 pb-2 pt-12 text-center">
          <h2 className="font-serif text-3xl text-foreground sm:text-4xl">One project at a time</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted">A fixed price you accept before anything is funded. Money moves milestone by milestone, only when you approve the work.</p>
        </section>
        <LandingPackages />
        <section className="border-t border-line px-6 pt-12 text-center">
          <h2 className="font-serif text-3xl text-foreground sm:text-4xl">Software plans</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted">For people who make and publish on their own.</p>
        </section>
        <PricingPlans />
        <LandingSections />
        <LandingFaq />
      </main>
      <SiteFooter />
    </div>
  );
}
