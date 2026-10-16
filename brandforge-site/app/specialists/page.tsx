import type { Metadata } from 'next';
import { pageMeta, pageGraph } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';
import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { QuoteRow } from '@/components/landing/home-sections';
import { listPublicSpecialists } from '@/lib/project-db';

const DESCRIPTION = 'Designers, editors, developers and marketers who ship your content, ads and site updates every month. Each one reviewed by a person.';
export const metadata: Metadata = pageMeta({ path: '/specialists', title: 'The BrandForge team — BrandForge', description: DESCRIPTION });

export const dynamic = 'force-dynamic';

// What each kind of team member does on a plan: the same deliverables the plans list (lib/plans.js).
const ROLES: { title: string; body: string }[] = [
  { title: 'Designers', body: 'Posts, carousels and ad creatives in your brand.' },
  { title: 'Editors', body: 'Short videos for Reels, Shorts and TikTok.' },
  { title: 'Developers', body: 'Site and store updates, landing pages, small automations.' },
  { title: 'Marketers', body: 'What to post, ads that run, and a monthly results report.' },
];

// How quality is kept, as the product works today.
const QUALITY: { title: string; body: string }[] = [
  { title: 'Reviewed before they work', body: 'Everyone applies with links to real work, and a person on the team checks it. No pay-to-join.' },
  { title: 'One lead per client', body: 'The first teammate to claim your chat leads your account and owns the month.' },
  { title: 'You approve every item', body: "Each month's work list lives in your chat. Nothing counts as delivered until you approve it." },
];

export default async function SpecialistsPage() {
  const specialists = await listPublicSpecialists().catch(() => []);
  return (
    <div className="bf-page">
      <JsonLd data={pageGraph({ path: '/specialists', name: 'The BrandForge team — BrandForge', description: DESCRIPTION, kind: 'CollectionPage', crumbs: [{ name: 'The team', path: '/specialists' }] })} />
      <LandingNav />
      <main>
        <section className="px-5 pb-12 pt-14 sm:px-8 sm:pt-20">
          <div className="mx-auto max-w-6xl">
            <h1 className="max-w-3xl font-serif text-5xl leading-[1.05] text-foreground sm:text-6xl" style={{ textWrap: 'balance' }}>The people behind your plan</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{DESCRIPTION}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/pricing" className="rounded-xl bg-ember px-6 py-3 text-base font-semibold text-on-ember transition hover:opacity-90">See plans · from €690/mo</Link>
              <Link href="/chat" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">Talk to the team</Link>
            </div>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map((role) => (
                <li key={role.title} className="rounded-2xl border border-line bg-panel p-5">
                  <p className="font-serif text-xl text-foreground">{role.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{role.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-label="How we keep quality" className="border-t border-line px-5 py-14 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-serif text-4xl text-foreground sm:text-5xl">How we keep quality</h2>
            <ul className="mt-8 grid gap-8 sm:grid-cols-3">
              {QUALITY.map((item) => (
                <li key={item.title}>
                  <p className="text-lg font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <QuoteRow ids={['support-understands-project', 'two-projects-9-10', 'eddie-website']} />

        {specialists.length > 0 ? (
          <section aria-label="Hire one specialist" className="border-t border-line px-5 py-14 sm:px-8">
            <div className="mx-auto max-w-6xl">
              <h2 className="font-serif text-3xl text-foreground">Or hire one specialist</h2>
              <p className="mt-2 text-sm text-muted">For a single job, pick someone in Trade and pay per milestone.</p>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {specialists.map((s) => (
                  <li key={s.handle}>
                    <Link href={`/specialists/${s.handle}`} className="block rounded-2xl border border-line bg-panel p-5 transition hover:border-ember">
                      <p className="font-serif text-xl text-foreground">{s.display_name}</p>
                      <p className="mt-1 text-sm text-muted">{s.headline}</p>
                      {s.skills.length > 0 ? <p className="mt-3 text-xs text-muted">{s.skills.slice(0, 4).join(' · ')}</p> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section className="border-t border-line px-5 py-10 sm:px-8">
          <p className="mx-auto max-w-6xl text-sm text-muted">
            Designer, editor, developer or marketer? <Link href="/apply" className="font-semibold text-foreground underline-offset-2 hover:underline">Apply to join the team</Link>. Already in? <Link href="/specialists/me" className="font-semibold text-foreground underline-offset-2 hover:underline">Edit your profile</Link>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
