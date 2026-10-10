import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { COMMUNITY_LINKS } from '@/lib/community';
import { ContractDiagram } from '@/components/overview/diagrams';

export const metadata = {
  title: 'BrandForge for developers: build, get paid, ship in the open',
  description:
    'Join the BrandForge team as a developer or designer, get paid per milestone through escrow, and build on a stack that ships daily.',
  alternates: { canonical: '/developers' },
};

const WHY = [
  ['Paid per milestone', 'Work arrives as milestones. The client funds escrow first, you deliver, they approve, and the money releases. No chasing invoices.'],
  ['Real briefs, already scoped', 'Briefs land with requirements, scope and an estimate drafted by AI and checked by a person, so you start from clarity.'],
  ['A team around you', 'You work in the client chat next to a lead, a designer and the founder. Small team, direct communication, fast decisions.'],
  ['Your own listing', 'Post your services in Trade and let clients find you, or answer open requests from anyone.'],
];

const STACK = ['Next.js and React', 'TypeScript', 'Supabase (Postgres and storage)', 'Vercel', 'Telegram and Discord bots', 'Automated tests on every change'];

export default function DevelopersPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Developers and designers</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl" style={{ textWrap: 'balance' }}>
          Build with BrandForge. Get paid as you ship.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          We are a small team that builds websites, apps, bots and brands for clients, with AI doing the first drafts and people making the result good. If you build well and finish what you start, there is paid work here.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/apply" className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90">Apply to join the team</Link>
          <a href={COMMUNITY_LINKS.discord.href} target="_blank" rel="noreferrer" className="rounded-xl border border-line px-5 py-2.5 text-sm text-foreground transition hover:border-ember">Join the Discord</a>
        </div>

        <section className="mt-14" aria-labelledby="why">
          <h2 id="why" className="font-serif text-3xl text-foreground">Why it works for builders</h2>
          <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {WHY.map(([name, line]) => (
              <div key={name} className="border-t border-line pt-4">
                <dt className="font-serif text-lg text-foreground">{name}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted">{line}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8"><ContractDiagram /></div>
        </section>

        <section className="mt-14 rounded-2xl border border-line bg-panel p-6" aria-labelledby="stack">
          <h2 id="stack" className="font-serif text-2xl text-foreground">What we build with</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {STACK.map((item) => (
              <li key={item} className="rounded-full border border-line px-3 py-1.5 text-xs text-foreground">{item}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-muted">The product ships almost every day and every change is checked by automated tests first. Releases are announced in our public changelog on Discord.</p>
        </section>

        <section className="mt-14" aria-labelledby="api">
          <h2 id="api" className="font-serif text-2xl text-foreground">A public API?</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Not yet. Today you can use BrandForge through the web app and the Telegram and Discord bots. If you would build on an API, tell us what for in the Discord and it moves up the list.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="how">
          <h2 id="how" className="font-serif text-2xl text-foreground">How to start</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>Apply with your specialty and links to real work. A person reads every application.</li>
            <li>When you are accepted you join the BrandForge team and get an email with your inbox.</li>
            <li>Open a brief, send a priced proposal from the chat, and get to work once the client signs and funds.</li>
          </ol>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
