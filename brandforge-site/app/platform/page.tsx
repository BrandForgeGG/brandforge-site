import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';

export const metadata = {
  title: 'Platform — BrandForge',
  description:
    'How the BrandForge platform runs a project end to end: structured briefs, proposals, contracts, admin-verified escrow, and milestone releases.',
};

const STAGES = [
  {
    name: 'Brief',
    body: 'You describe the idea in chat. The AI structures it into requirements, scope, milestones, and an estimate you correct before anyone builds.',
  },
  {
    name: 'Proposal',
    body: 'A vetted specialist sends a priced proposal with timeline. You can accept it, counter once, or decline — the card in chat carries the numbers.',
  },
  {
    name: 'Contract',
    body: 'Both sides sign in the chat. The signed terms become the source of truth for scope and payment.',
  },
  {
    name: 'Escrow',
    body: 'You fund in crypto; an admin verifies the transfer on-chain. Funds sit in escrow — nobody has been paid yet.',
  },
  {
    name: 'Delivery',
    body: 'Work arrives as tasks and milestones. You approve or send back from the project panel.',
  },
  {
    name: 'Release',
    body: 'Approved milestones release payment. If something goes wrong, the remaining funds stay with you — see the refund policy.',
  },
];

export default function PlatformPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Platform</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl">
          One pipeline, from idea to released payment
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          BrandForge is built for two sides of the same table: founders who need
          something built, and specialists who build it. The platform keeps both
          honest at every step.
        </p>

        <div className="mt-12">
          <h2 className="font-serif text-2xl text-foreground">The pipeline</h2>
          <ol className="mt-6 space-y-4">
            {STAGES.map((stage, index) => (
              <li key={stage.name} className="flex gap-4 rounded-2xl border border-line bg-panel p-5">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-sm font-semibold text-ember"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-serif text-lg text-foreground">{stage.name}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{stage.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <section className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="font-serif text-xl text-foreground">For founders</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              You pay nothing before you accept a proposal. Your money sits in escrow and
              moves only when you approve delivered work. Every decision — counter,
              signature, funding, release — is made by you, in the chat.
            </p>
          </section>
          <section className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="font-serif text-xl text-foreground">For specialists</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Briefs land in a staff inbox and in Discord. Proposals, counters, and
              signatures happen in the founder&apos;s chat, and accepted work is funded
              in escrow               before you start building.{' '}
              <Link href="/apply" className="text-ember underline-offset-2 hover:underline">
                Apply as a specialist
              </Link>
              .
            </p>
          </section>
          <section className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="font-serif text-xl text-foreground">Trust by construction</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Accounts only see their own data. Funding is verified on-chain before a
              project is marked paid, contracts are signed by both sides, and every
              stage change is recorded — not remembered.
            </p>
          </section>
          <section className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="font-serif text-xl text-foreground">Wired into your tools</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Telegram for personal pings, Discord for team channels and the public
              feed, GitHub for release and changelog posts, email for founder stage
              notifications. Connect Telegram from Settings.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
