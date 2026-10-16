import Image from 'next/image';
import Link from 'next/link';
import { PricingPlans } from '@/components/pricing-plans';
import { PORTFOLIO_PROJECTS, projectSlug } from '@/lib/portfolio-projects';
import { TESTIMONIALS } from '@/lib/testimonials';

// The homepage answers a buyer's three questions in order: what do I get, can these people deliver, what happens when I pay.

const WORK = PORTFOLIO_PROJECTS.filter((project) => project.screenshot).slice(0, 4);

// Verbatim client words (lib/testimonials.js): the three about ongoing content and brand work, which is what the plans sell.
const QUOTES = ['charizard-5stars', 'deleted-user-content', 'deleted-user-mx-growth']
  .map((id) => TESTIMONIALS.find((quote) => quote.id === id))
  .filter((quote): quote is NonNullable<typeof quote> => Boolean(quote));

const STEPS = [
  ['Pick a plan', 'Card or crypto. Cancel any month.'],
  ['Your team chat opens', 'The moment you pay. Send your site and goals.'],
  ['Work ships every week', "Posts, videos, ads and site updates. If month one isn't delivered, you get a full refund."],
];

export function HomeHero() {
  return (
    <section className="px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <div>
          <h1 className="font-serif text-5xl leading-[1.02] text-foreground sm:text-6xl lg:text-7xl" style={{ textWrap: 'balance' }}>
            A full growth team for <span className="text-ember">less than one hire.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
            Designers, editors, developers and marketers ship your content, ads and site updates every month.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="#pricing" className="rounded-xl bg-ember px-6 py-3 text-base font-semibold text-on-ember transition hover:opacity-90">See plans · from €690/mo</Link>
            <a href="https://t.me/headstartup" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">Questions? Message us</a>
          </div>
          <p className="mt-4 text-sm text-muted">If month one isn&apos;t delivered, you get a full refund.</p>
        </div>
        <div>
          <div className="grid grid-cols-2 gap-3">
            {WORK.map((project) => (
              <Link key={project.name} href={`/work/${projectSlug(project.name)}`} className="group overflow-hidden rounded-2xl border border-line bg-panel transition hover:border-ember">
                <Image src={project.screenshot as string} alt={`${project.name}, ${project.description}`} width={640} height={400} className="aspect-[16/10] w-full object-cover object-top" />
                <span className="block truncate px-3 py-2 text-xs text-muted group-hover:text-foreground">{project.name}</span>
              </Link>
            ))}
          </div>
          <Link href="/work" className="mt-3 inline-block text-xs font-semibold text-muted underline-offset-2 hover:text-foreground hover:underline">Client work, live. See all →</Link>
        </div>
      </div>
    </section>
  );
}

export function HomeSteps() {
  return (
    <section aria-label="How it works" className="border-t border-line px-5 py-14 sm:px-8">
      <ol className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-3">
        {STEPS.map(([title, line], i) => (
          <li key={title}>
            <span className="font-serif text-3xl text-ember">{i + 1}</span>
            <p className="mt-2 text-lg font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{line}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function HomeQuotes() {
  return (
    <section aria-label="What clients say" className="border-t border-line px-5 py-14 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        {QUOTES.map((quote) => (
          <figure key={quote.id} className="flex flex-col justify-between rounded-3xl border border-line bg-panel p-6">
            <blockquote className="text-base leading-relaxed text-foreground">&ldquo;{quote.text}&rdquo;</blockquote>
            <figcaption className="mt-4 text-xs text-muted">{quote.author === 'Deleted User' ? 'Client' : quote.author}, on Discord</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function HomePricing() {
  return (
    <section id="pricing" className="scroll-mt-16 border-t border-line px-5 pt-16 sm:px-8 sm:pt-20">
      <h2 className="mx-auto max-w-6xl font-serif text-4xl text-foreground sm:text-5xl">Pricing</h2>
      <PricingPlans />
    </section>
  );
}

// The tools stay one line away for people who would rather do it themselves.
export function HomeDiy() {
  return (
    <section className="border-t border-line px-5 py-10 sm:px-8">
      <p className="mx-auto max-w-6xl text-sm text-muted">
        Rather do it yourself?{' '}
        <Link href="/create" className="font-semibold text-foreground underline-offset-2 hover:underline">Make it with AI</Link>,{' '}
        <Link href="/distribute" className="font-semibold text-foreground underline-offset-2 hover:underline">post it everywhere</Link>, or{' '}
        <Link href="/trade" className="font-semibold text-foreground underline-offset-2 hover:underline">hire one specialist</Link>. Free to start.
      </p>
    </section>
  );
}
