import { notFound } from 'next/navigation';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { BlueprintFlow } from '@/components/blueprint/blueprint-flow';
import { blueprintConfig } from '@/lib/blueprint-config';

// Evaluated per request so flipping BLUEPRINT_ENABLED takes effect on the next
// redeploy without touching code. Dormant (404) whenever the flag is off —
// same gate as the API routes.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Free blueprint — BrandForge',
  description:
    'Describe your problem in plain words and get an AI-drafted blueprint: vision, build, timeline and a first price range. No account needed.',
};

export default function BlueprintPage() {
  const config = blueprintConfig();
  if (!config.enabled) notFound();

  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Free blueprint</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl">
          Describe the problem. Get a plan.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          No account needed. The AI drafts your blueprint — vision, build, timeline and a first
          price range — from what you write. Keep it for yourself, refine it, or send it to the
          team.
        </p>

        <BlueprintFlow intakeMinChars={config.intakeMinChars} intakeMaxChars={config.intakeMaxChars} />
      </main>
      <SiteFooter />
    </div>
  );
}
