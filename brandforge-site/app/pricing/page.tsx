import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMeta, pageGraph } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';
import { LandingNav } from '@/components/landing/landing-nav';
import { PricingPlans } from '@/components/pricing-plans';
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
        <p className="mx-auto max-w-2xl border-t border-line px-6 py-10 text-center text-sm text-muted">
          One project instead, like a website or an app?{' '}
          <Link href="/chat" className="font-semibold text-foreground underline-offset-4 hover:underline">Describe it in the chat</Link>. You get a fixed price before you pay anything.
        </p>
        <LandingFaq />
      </main>
      <SiteFooter />
    </div>
  );
}
