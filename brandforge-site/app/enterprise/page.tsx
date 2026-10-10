import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { COMMUNITY_LINKS } from '@/lib/community';
import { ContractDiagram } from '@/components/overview/diagrams';

export const metadata = {
  title: 'BrandForge for bigger projects: a named team, fixed prices, escrow',
  description:
    'For companies and serious budgets: a scoped build or retainer from a BrandForge team, with fixed-price proposals and milestone contracts held in escrow.',
  alternates: { canonical: '/enterprise' },
};

const GET = [
  ['A named lead and a small team', 'One person who owns your project, with a designer and developers behind them. You always know who is on it.'],
  ['A fixed price you agree first', 'Every proposal carries a price and a timeline. Counter it once, accept it, or decline it. Nothing is funded until you agree.'],
  ['Escrow you control', 'Fund by card or crypto. Money is held until you approve each milestone, or it releases on its own after 48 hours of silence.'],
  ['A direct line to the founder', 'For larger projects the founder joins the chat. Problems reach someone who can fix them the same day.'],
];

const BUILD = ['Websites and brands', 'SaaS and web apps', 'Mobile apps', 'Marketplaces and platforms', 'Bots and automation', 'AI integrations and dashboards'];

export default function EnterprisePage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Bigger projects</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl" style={{ textWrap: 'balance' }}>
          Serious budgets deserve a serious process.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          For companies and high-value projects from €5,000: a scoped build or retainer from a BrandForge team, with AI doing the heavy first drafts and people owning the result.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/chat?plan=custom" className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90">Describe your project</Link>
          <a href={COMMUNITY_LINKS.telegramManager.href} target="_blank" rel="noreferrer" className="rounded-xl border border-line px-5 py-2.5 text-sm text-foreground transition hover:border-ember">Message the project manager</a>
        </div>

        <section className="mt-14" aria-labelledby="get">
          <h2 id="get" className="font-serif text-3xl text-foreground">What you get</h2>
          <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {GET.map(([name, line]) => (
              <div key={name} className="border-t border-line pt-4">
                <dt className="font-serif text-lg text-foreground">{name}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted">{line}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8"><ContractDiagram /></div>
        </section>

        <section className="mt-14 rounded-2xl border border-line bg-panel p-6" aria-labelledby="build">
          <h2 id="build" className="font-serif text-2xl text-foreground">What we build</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {BUILD.map((item) => (
              <li key={item} className="rounded-full border border-line px-3 py-1.5 text-xs text-foreground">{item}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">
            Open any of the <Link href="/work" className="text-ember underline-offset-2 hover:underline">shipped projects</Link> and judge the work yourself. Client reviews are on the <Link href="/#feedback" className="text-ember underline-offset-2 hover:underline">front page</Link>.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="process">
          <h2 id="process" className="font-serif text-2xl text-foreground">How a project runs</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>Describe the project in a chat. AI turns it into requirements, scope and an estimate you correct.</li>
            <li>A BrandForge lead sends a priced proposal with a timeline. You accept, counter once, or decline.</li>
            <li>Both sides sign the contract in the chat.</li>
            <li>You fund escrow. Work starts when funding is verified.</li>
            <li>Each milestone is delivered, reviewed and approved before its money releases.</li>
          </ol>
          <p className="mt-4 text-xs text-muted">Your accounts see only your own data, contracts are signed by both sides and every stage change is recorded. See the <Link href="/platform" className="text-ember underline-offset-2 hover:underline">platform page</Link> and the <Link href="/refunds" className="text-ember underline-offset-2 hover:underline">refund policy</Link>.</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
