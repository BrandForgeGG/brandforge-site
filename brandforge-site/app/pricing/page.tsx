import { LandingNav } from '@/components/landing/landing-nav';
import { PricingPlans } from '@/components/pricing-plans';
import { LandingPackages } from '@/components/landing/landing-packages';
import { LandingSections } from '@/components/landing/landing-sections';
import { LandingFaq } from '@/components/landing/landing-faq';
import { SiteFooter } from '@/components/site-footer';

export const metadata = {
  alternates: { canonical: '/pricing' },
  title: 'Pricing — BrandForge',
  description:
    'Fixed-price proposals, milestone escrow and no charge until you accept. Packages, how the process works, and answers to common questions.',
};

export default function PricingPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main>
        <header className="px-6 pb-2 pt-14 text-center">
          <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl">
            Fixed price. Nothing charged until you accept.
          </h1>
        </header>
        <PricingPlans />
        <LandingPackages />
        <LandingSections />
        <LandingFaq />
      </main>
      <SiteFooter />
    </div>
  );
}
