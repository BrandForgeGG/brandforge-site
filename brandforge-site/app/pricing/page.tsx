import type { Metadata } from 'next';
import { pageMeta, pageGraph } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';
import { LandingNav } from '@/components/landing/landing-nav';
import { PricingPlans } from '@/components/pricing-plans';
import { LandingPackages } from '@/components/landing/landing-packages';
import { LandingSections } from '@/components/landing/landing-sections';
import { LandingFaq } from '@/components/landing/landing-faq';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = pageMeta({ path: "/pricing", title: "Pricing: a growth team or the software", description: "A full growth team from €690 a month, or the software from €0. Pro is €19 a month." });

export default function PricingPage() {
  return (
    <div className="bf-page">
      <JsonLd data={pageGraph({ path: "/pricing", name: "Pricing: a growth team or the software", description: "A full growth team from €690 a month, or the software from €0. Pro is €19 a month.", kind: "WebPage", crumbs: [{ name: "Pricing", path: "/pricing" }] })} />
      <LandingNav />
      <main>
        <header className="px-6 pb-2 pt-14 text-center">
          <h1 className="mx-auto max-w-3xl font-serif text-4xl text-foreground sm:text-5xl" style={{ textWrap: 'balance' }}>
            A full growth team for less than one hire.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted">
            Or use the software on its own, from free.
          </p>
        </header>
        <PricingPlans />
        <section className="border-t border-line px-6 pb-2 pt-12 text-center">
          <h2 className="font-serif text-3xl text-foreground sm:text-4xl">One project at a time</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted">A fixed price you accept before anything is funded. Money moves milestone by milestone, only when you approve the work.</p>
        </section>
        <LandingPackages />
        <LandingSections />
        <LandingFaq />
      </main>
      <SiteFooter />
    </div>
  );
}
