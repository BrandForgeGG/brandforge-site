import Image from 'next/image';
import Link from 'next/link';
import { PricingPlans } from '@/components/pricing-plans';
import { TaskMenu } from '@/components/task-menu';
import { ExecutionEngine } from '@/components/landing/execution-engine';
import { Reveal } from '@/components/landing/reveal';
import { TrackLink } from '@/components/landing/track-link';
import { PORTFOLIO_PROJECTS, projectSlug } from '@/lib/portfolio-projects';
import { TESTIMONIALS } from '@/lib/testimonials';

// The homepage, in the order a buyer asks: what can you do for me (hero), can you deliver (real work), how does it run
// (workflow), why people plus AI (AI section), what exactly (services), who says so (reviews), what does it cost (plans),
// and what now (final call to action). Human execution leads; AI is the second pillar.

const WORK = PORTFOLIO_PROJECTS.filter((project) => project.screenshot).slice(0, 6);

// Verbatim client words (lib/testimonials.js).
const HOME_QUOTES = ['charizard-5stars', 'deleted-user-content', 'vizzy-multiple-projects'];

const quotesFor = (ids: string[]) =>
  ids.map((id) => TESTIMONIALS.find((quote) => quote.id === id)).filter((quote): quote is NonNullable<typeof quote> => Boolean(quote));

// How a review is signed: the Discord name as written, or Client when the account is gone or unnamed.
const signedBy = (author: string) => (/^(deleted user|brandforge client)$/i.test(author) ? 'Client' : author.replace(/^[^A-Za-z0-9]+\s*/, ''));

const primary = 'inline-flex items-center justify-center rounded-xl bg-ember px-6 py-3 text-base font-semibold text-on-ember transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember';
const secondary = 'inline-flex items-center justify-center rounded-xl border border-line bg-panel px-6 py-3 text-base font-semibold text-foreground transition hover:border-ember focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember';

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-ember">{children}</p>;
}

function SectionHead({ eyebrow, title, line }: { eyebrow: string; title: React.ReactNode; line?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-serif text-4xl leading-[1.08] text-foreground sm:text-5xl" style={{ textWrap: 'balance' }}>{title}</h2>
      {line ? <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-foreground/75">{line}</p> : null}
    </div>
  );
}

// 1. Hero: the promise, the way in, and the execution engine.
export function HomeHero() {
  return (
    <section className="px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 [&>*]:min-w-0">
        <div className="text-center lg:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">Design · Development · Marketing · Video</p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.02] text-foreground sm:text-6xl lg:text-7xl" style={{ textWrap: 'balance' }}>
            Have an idea. <span className="text-ember">We&apos;ll make it happen.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-foreground/80 sm:text-xl lg:mx-0">
            Designers, developers, marketers and editors, with powerful AI. One accountable team that turns your idea into finished work.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <TrackLink href="/chat" source="hero_start" className={`${primary} w-full sm:w-auto`}>Start a project</TrackLink>
            <TrackLink href="/create" source="hero_ai" className={`${secondary} w-full sm:w-auto`}>Explore AI tools</TrackLink>
          </div>
          <p className="mt-5 text-sm text-foreground/70">Talk to the team first. You pay only when you agree.</p>
        </div>
        <ExecutionEngine />
      </div>
    </section>
  );
}

// 2. Proof: real shipped sites and apps, big enough to judge.
export function HomeWork() {
  return (
    <section id="work" className="scroll-mt-16 border-t border-line px-5 py-20 sm:px-8 sm:py-28">
      <Reveal className="bf-reveal mx-auto max-w-6xl">
        <SectionHead eyebrow="Real work" title="Shipped by the team" line="Live sites and apps our people built. Open any of them and judge the work." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WORK.map((project, index) => (
            <article key={project.name} className={`group flex flex-col overflow-hidden rounded-3xl border border-line bg-panel ${index === 0 ? 'sm:col-span-2 lg:row-span-2' : ''}`}>
              <Link href={`/work/${projectSlug(project.name)}`} className="bf-work-shot relative block flex-1 overflow-hidden bg-overlay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ember" aria-label={`${project.name}: see the project`}>
                <Image
                  src={project.screenshot as string}
                  alt={`${project.name}, ${project.description}`}
                  width={1280}
                  height={800}
                  sizes={index === 0 ? '(min-width: 1024px) 760px, (min-width: 640px) 90vw, 100vw' : '(min-width: 1024px) 380px, (min-width: 640px) 45vw, 100vw'}
                  className={`w-full object-cover ${index === 0 ? 'aspect-[16/10] object-left-top lg:aspect-auto lg:h-full' : 'aspect-[16/10] object-top'}`}
                />
              </Link>
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-serif text-xl text-foreground">{project.name}</p>
                  <p className="truncate text-sm text-foreground/70">{project.description} · {project.category}</p>
                </div>
                <a href={project.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-ember">
                  Visit live <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-8 text-center">
          <Link href="/work" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">See all client work <span aria-hidden="true">→</span></Link>
        </p>
      </Reveal>
    </section>
  );
}

// 3. How a project runs: five stages, each with the artifact it produces, joined by a line that fills as you arrive.
const FLOW: { title: string; who: string; line: string; artifact: React.ReactNode }[] = [
  {
    title: 'Describe',
    who: 'You',
    line: 'Tell the team what you need in the chat. No forms, no call needed.',
    artifact: <span className="block rounded-xl rounded-br-sm px-3 py-2 text-xs leading-snug text-foreground" style={{ background: 'color-mix(in srgb, var(--ember) 12%, transparent)' }}>We need a landing page for our launch.</span>,
  },
  {
    title: 'Plan',
    who: 'Team and you',
    line: 'Agree the scope and the price: a monthly plan, or a task the team accepts or counters.',
    artifact: (
      <span className="block w-32 rounded-xl border border-line bg-background/60 px-3 py-2 text-left text-xs text-foreground">
        <span className="flex items-center justify-between"><span className="font-semibold">Task</span><span className="rounded-full bg-trust/15 px-1.5 text-[10px] font-semibold text-success">Accepted</span></span>
        <span className="mt-1 block font-serif text-base">€900</span>
      </span>
    ),
  },
  {
    title: 'Execute',
    who: 'People and AI',
    line: 'Designers, developers, marketers and editors do the work. AI speeds up drafts and research.',
    artifact: (
      <span className="flex flex-wrap gap-1 lg:justify-center">
        {['Design', 'Dev', 'Marketing'].map((role) => <span key={role} className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-foreground">{role}</span>)}
        <span className="rounded-full bg-overlay px-2 py-0.5 text-[11px] font-semibold text-foreground">AI</span>
      </span>
    ),
  },
  {
    title: 'Review',
    who: 'You',
    line: 'See the real work in your chat. Approve it, or ask for changes.',
    artifact: (
      <span className="flex gap-1.5">
        <span className="rounded-lg bg-ember px-2.5 py-1 text-[11px] font-semibold text-on-ember">Approve</span>
        <span className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold text-foreground">Changes</span>
      </span>
    ),
  },
  {
    title: 'Ship',
    who: 'Team',
    line: 'It is delivered. Money held by BrandForge is released when you approve.',
    artifact: <span className="flex items-center gap-1.5 text-xs font-semibold text-success"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-trust/15" aria-hidden="true">✓</span>Shipped</span>,
  },
];

export function HomeWorkflow() {
  return (
    <section id="how" className="scroll-mt-16 border-t border-line bg-deep/40 px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal className="bf-reveal">
          <SectionHead eyebrow="How it works" title="From an idea to shipped work" line="One team runs the whole project with you, in one chat, with a project manager on every funded project." />
        </Reveal>
        <Reveal as="ol" threshold={0.3} className="relative mt-14 grid gap-8 lg:grid-cols-5 lg:gap-5">
          {/* The connecting line: across on wide screens, down the side on phones. */}
          <span aria-hidden="true" className="absolute left-[19px] top-2 block h-[calc(100%-1rem)] w-px bg-line lg:hidden">
            <span className="bf-flow-fill-y block h-full w-full bg-ember" />
          </span>
          <span aria-hidden="true" className="absolute left-[10%] right-[10%] top-[19px] hidden h-px bg-line lg:block">
            <span className="bf-flow-fill block h-full w-full bg-ember" />
          </span>
          {FLOW.map((step, index) => (
            <li key={step.title} className="relative flex gap-4 lg:flex-col lg:items-center lg:gap-0 lg:text-center">
              <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ember bg-background font-serif text-lg text-ember">{index + 1}</span>
              <div className="min-w-0 lg:mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/60">{step.who}</p>
                <p className="mt-1 font-serif text-2xl text-foreground">{step.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/80">{step.line}</p>
                <div className="mt-4 flex lg:justify-center">{step.artifact}</div>
              </div>
            </li>
          ))}
        </Reveal>
        <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-foreground/70">
          Team plans are invoiced monthly in your chat, with a full refund if month one isn&apos;t delivered. Tasks and projects are funded once agreed and released on your approval.
        </p>
      </div>
    </section>
  );
}

// 4. The second pillar: AI makes the first version, people take it the rest of the way. The draft is a real creation
// made with Create; the finishing step is the real "Have the team finish this" in the chat.
export function HomeAiPeople({ draft }: { draft: { title: string; image: string; kind: string } | null }) {
  const card = 'flex flex-col rounded-3xl border border-line bg-panel p-5';
  const label = 'text-[11px] font-semibold uppercase tracking-[0.14em]';
  return (
    <section id="ai" className="scroll-mt-16 border-t border-line px-5 py-20 sm:px-8 sm:py-28">
      <Reveal className="bf-reveal mx-auto max-w-6xl">
        <SectionHead eyebrow="People and AI" title="AI accelerates the work. People take it further." line="Start with the AI tools, free. When it has to be right, the team finishes it in the same chat." />
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <li className={card}>
            <p className={`${label} text-foreground/60`}>1 · Idea</p>
            <p className="mt-4 rounded-xl bg-overlay px-4 py-3 font-serif text-lg leading-snug text-foreground">&ldquo;{draft?.title ?? 'Three tools every brand needs'}&rdquo;</p>
            <p className="mt-auto pt-4 text-sm text-foreground/75">One sentence in the chat or in Create.</p>
          </li>
          <li className={card}>
            <p className={`${label} text-foreground/60`}>2 · AI first draft</p>
            {draft ? (
              <span className="relative mt-4 block aspect-[4/5] overflow-hidden rounded-xl bg-overlay">
                <Image src={draft.image} alt={`AI draft: ${draft.title}`} fill unoptimized loading="lazy" className="object-cover" />
              </span>
            ) : null}
            <p className="mt-auto pt-4 text-sm text-foreground/75">{draft ? `A real ${draft.kind} made with Create, in seconds.` : 'Carousels, ads, videos and articles in seconds.'}</p>
          </li>
          <li className={card}>
            <p className={`${label} text-ember`}>3 · Human refinement</p>
            <span className="mt-4 block rounded-xl border border-line bg-background/60 p-3">
              <span className="block rounded-lg border border-ember/50 bg-ember/10 px-3 py-2 text-center text-xs font-semibold text-foreground">Have the team finish this</span>
              <span className="mt-2 block rounded-lg border border-line px-3 py-2 text-xs text-foreground/80">Polish the design and the words so it is ready to post.</span>
            </span>
            <p className="mt-auto pt-4 text-sm text-foreground/75">One tap under any creation. A designer or editor takes it from there.</p>
          </li>
          <li className={card}>
            <p className={`${label} text-success`}>4 · Finished</p>
            <span className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-background/60 px-3 py-3 text-sm font-semibold text-success">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-trust/15" aria-hidden="true">✓</span>
              Approved in your chat
            </span>
            <p className="mt-auto pt-4 text-sm text-foreground/75">You approve the finished piece, then post it or schedule it.</p>
          </li>
        </ol>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <TrackLink href="/create" source="ai_section_tools" className={`${secondary} w-full sm:w-auto`}>Explore AI tools</TrackLink>
          <TrackLink href="/chat" source="ai_section_team" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">Or have the team do it</TrackLink>
        </div>
      </Reveal>
    </section>
  );
}

// 5. Services: what a task can be.
export function HomeServices() {
  return (
    <section id="services" className="scroll-mt-16 border-t border-line px-5 pb-20 pt-6 sm:px-8 sm:pb-24 sm:pt-10">
      <Reveal className="bf-reveal mx-auto max-w-6xl">
        <TaskMenu />
      </Reveal>
    </section>
  );
}

/** Three verbatim client reviews (lib/testimonials.js) in a row. */
export function QuoteRow({ ids = HOME_QUOTES }: { ids?: string[] }) {
  return (
    <section aria-label="What clients say" className="border-t border-line px-5 py-14 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        {quotesFor(ids).map((quote) => (
          <figure key={quote.id} className="flex flex-col justify-between rounded-3xl border border-line bg-panel p-6">
            <blockquote className="text-base leading-relaxed text-foreground">&ldquo;{quote.text}&rdquo;</blockquote>
            <figcaption className="mt-4 text-xs text-foreground/70">{signedBy(quote.author)}, on Discord</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// 6. Reviews, with a heading on the homepage.
export function HomeQuotes() {
  return (
    <section aria-label="What clients say" className="border-t border-line px-5 pt-20 sm:px-8 sm:pt-24">
      <Reveal className="bf-reveal mx-auto max-w-6xl">
        <SectionHead eyebrow="Clients" title="In their words" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {quotesFor(HOME_QUOTES).map((quote) => (
            <figure key={quote.id} className="flex flex-col justify-between rounded-3xl border border-line bg-panel p-6">
              <blockquote className="text-base leading-relaxed text-foreground">&ldquo;{quote.text}&rdquo;</blockquote>
              <figcaption className="mt-4 text-xs text-foreground/70">{signedBy(quote.author)}, on Discord</figcaption>
            </figure>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

// 7. Plans.
export function HomePricing() {
  return (
    <section id="pricing" className="scroll-mt-16 px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Pricing" title="A full growth team for less than one hire" line="Monthly, with 1 or 2 tasks always in progress. Or one task at a time, with your own budget." />
        <PricingPlans bare tasks={false} />
      </div>
    </section>
  );
}

// 9. The last word: one clear next step.
export function HomeFinalCta() {
  return (
    <section className="px-5 pb-20 sm:px-8 sm:pb-28">
      <Reveal className="bf-reveal mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-foreground px-6 py-14 text-center sm:px-12 sm:py-20">
        <h2 className="mx-auto max-w-2xl font-serif text-4xl leading-[1.08] text-background sm:text-5xl" style={{ textWrap: 'balance' }}>Have an idea? Tell the team.</h2>
        <p className="mx-auto mt-4 max-w-lg text-lg text-background/75">A person replies in the chat. Agree the scope and the price first, then the work starts.</p>
        <div className="mt-8 flex justify-center">
          <TrackLink href="/chat" source="final_start" className={primary}>Start a project</TrackLink>
        </div>
      </Reveal>
    </section>
  );
}
