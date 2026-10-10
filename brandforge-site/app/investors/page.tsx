import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { COMMUNITY_LINKS } from '@/lib/community';
import { HeroDiagram, TradeDiagram } from '@/components/overview/diagrams';

export const metadata = {
  title: 'BrandForge for investors: AI and people, one workspace',
  description:
    'What BrandForge is, what is live today, how it earns, and where it goes next. An early company that ships weekly. Talk to the founder.',
  alternates: { canonical: '/investors' },
};

const LIVE = [
  ['A chat that works', 'Describe an idea, paste a link or drop a file and get a researched first answer before any sign-up.'],
  ['Make and publish', 'A carousel maker inside the chat, with more formats on the way, and captions for every platform.'],
  ['Trade, open to everyone', 'Anyone lists a gig, product, tool, launch or request by describing it. Every listing gets its own assistant chat.'],
  ['Contracts with escrow', 'Milestone contracts between members, funded in escrow and released as work is approved. A flat 5% on release.'],
  ['The BrandForge team', 'A named team that builds for clients. Ten shipped projects with live links, and a stream of client reviews.'],
  ['Everywhere people are', 'Telegram and Discord bots, email that follows what people actually do, and an admin cockpit for the team.'],
];

const MONEY = [
  ['Monthly team plans', 'From €490 to €2,490 a month, with custom projects from €5,000. The first revenue line, because the team and the clients already exist.'],
  ['A flat 5% on contracts', 'Taken when a milestone is released. It grows with every deal that runs through Trade.'],
  ['Software plans', 'Pro (€19) and Agency (€79) for people who publish on their own. They open as publishing channels are approved.'],
];

export default function InvestorsPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Investors</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl" style={{ textWrap: 'balance' }}>
          AI drafts. People finish. Trust is the product.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          Using the internet without AI is becoming a disadvantage, but AI alone does not finish the job or earn trust. BrandForge puts AI first drafts, real people and escrowed contracts in one workspace, so anyone can make, publish and trade.
        </p>
        <div className="mt-8"><HeroDiagram /></div>

        <section className="mt-14" aria-labelledby="live">
          <h2 id="live" className="font-serif text-3xl text-foreground">What is live today</h2>
          <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {LIVE.map(([name, line]) => (
              <div key={name} className="border-t border-line pt-4">
                <dt className="font-serif text-lg text-foreground">{name}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted">{line}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8"><TradeDiagram /></div>
        </section>

        <section className="mt-14" aria-labelledby="money">
          <h2 id="money" className="font-serif text-3xl text-foreground">How it earns</h2>
          <ul className="mt-6 space-y-4">
            {MONEY.map(([name, line]) => (
              <li key={name} className="rounded-2xl border border-line bg-panel p-5">
                <p className="font-serif text-lg text-foreground">{name}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{line}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">
            See the plans on the <Link href="/pricing" className="text-ember underline-offset-2 hover:underline">pricing page</Link>.
          </p>
        </section>

        <section className="mt-14 rounded-2xl border border-line bg-panel p-6" aria-labelledby="stand">
          <h2 id="stand" className="font-serif text-3xl text-foreground">Where it stands</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            BrandForge is early and ships almost every day. What we can stand behind: a community of over a thousand on Discord, ten client projects delivered with live links you can open on the <Link href="/work" className="text-ember underline-offset-2 hover:underline">work page</Link>, and written reviews from clients. Revenue, usage and the full picture go in a data room for people we talk to. We do not publish numbers we cannot show.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="next">
          <h2 id="next" className="font-serif text-3xl text-foreground">The next 90 days</h2>
          <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>Sell the first ten monthly team plans and prove the delivery loop.</li>
            <li>Take card payments for plans and keep escrow for bigger contracts.</li>
            <li>Get one-tap publishing approved on the big platforms, starting with the easiest.</li>
            <li>Add the next formats: updates, polls, quizzes, threads and video.</li>
            <li>Grow Trade with real listings and a steady flow of requests.</li>
          </ul>
        </section>

        <section className="mt-14 rounded-2xl border border-ember/40 bg-ember/5 p-6 text-center">
          <h2 className="font-serif text-2xl text-foreground">Talk to the founder</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">A short message is enough. We reply, send the data room and set up a call.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <a href={COMMUNITY_LINKS.telegramManager.href} target="_blank" rel="noreferrer" className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90">Message on Telegram</a>
            <a href="mailto:hello@brandforge.gg?subject=BrandForge%20investor%20note" className="rounded-xl border border-line px-5 py-2.5 text-sm text-foreground transition hover:border-ember">hello@brandforge.gg</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
