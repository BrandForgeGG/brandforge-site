import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';

export const metadata = {
  title: 'Features — BrandForge',
  description:
    'Chat-first project briefs, priced proposals, two-sided contracts, escrow-protected milestones, and notifications in Telegram and Discord.',
};

const FEATURES = [
  {
    title: 'Chat-first briefs',
    body:
      'Describe what you want in plain language. BrandForge AI asks the sharp questions and turns your answers into requirements, scope, milestones, and an estimate — in the same chat, where you can correct every line.',
  },
  {
    title: 'Priced proposals',
    body:
      'A vetted specialist reviews your brief and joins the conversation with a fixed scope, price, and timeline. Accept, counter, or decline — negotiation happens in thread, with the numbers on the card.',
  },
  {
    title: 'Contracts both sides sign',
    body:
      'Before work starts, both you and the team sign the agreement in the chat. Signatures, terms, and milestones live next to the conversation they belong to.',
  },
  {
    title: 'Escrow-backed payments',
    body:
      'Fund in crypto to the BrandForge escrow wallet; funding is verified on-chain by an admin. Money releases milestone by milestone, only after you approve the delivered work.',
  },
  {
    title: 'Delivery with approvals',
    body:
      'Tasks move through review inside the project panel. Approve what works, send back what does not — the specialist sees it in the same chat.',
  },
  {
    title: 'Notifications where you already are',
    body:
      'Link Telegram in Settings and get pinged the moment a brief, proposal, or delivery needs you. Founders get stage notifications on Telegram and email; the team works from Discord channels.',
  },
  {
    title: 'One workspace per project',
    body:
      'The sidebar keeps every project you own. The project context panel holds requirements, team, files, tasks, contract, and payments — always in sync with the chat.',
  },
  {
    title: 'Light and Forge themes',
    body:
      'Light is the default look. Forge is the original dark BrandForge surface — switch any time in Settings.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Features</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl">
          Everything happens in one chat
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Briefs, proposals, contracts, escrow, and delivery — the whole project
          lifecycle lives in the conversation it started from.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <section key={feature.title} className="rounded-2xl border border-line bg-panel p-6">
              <h2 className="font-serif text-xl text-foreground">{feature.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">{feature.body}</p>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
