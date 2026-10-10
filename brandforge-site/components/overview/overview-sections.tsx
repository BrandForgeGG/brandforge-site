import Link from 'next/link';
import { ContractDiagram, DistributeDiagram, FormatsDiagram, HeroDiagram, PaceDiagram, TradeDiagram } from '@/components/overview/diagrams';

// The overview is the long answer to "what is this?": one promise, one diagram, real screenshots
// of the product, a plain price line. Everything it shows is the app itself.

export function OverviewHero({ compact = false }: { compact?: boolean } = {}) {
  const Title = compact ? 'h2' : 'h1';
  return (
    <section className={`px-6 pb-10 text-center ${compact ? 'pt-16' : 'pt-14 sm:pt-20'}`} aria-labelledby="overview-title">
      <div className="mx-auto max-w-3xl">
        <Title id="overview-title" className="font-serif text-4xl leading-[1.08] tracking-[-0.02em] text-foreground sm:text-6xl" style={{ textWrap: 'balance' }}>
          AI and people, <span className="text-ember">on the same page.</span>
        </Title>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          Make every kind of message and publish it. Trade products, services and requests. AI does the first draft in seconds; people finish the job.
        </p>
        {compact ? null : (
          <>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/" className="rounded-xl bg-ember px-6 py-3 text-sm font-semibold text-background transition hover:opacity-90">
                Start a chat
              </Link>
              <a href="#how" className="rounded-xl border border-line px-6 py-3 text-sm text-foreground transition hover:border-ember">
                See how it works
              </a>
            </div>
            <p className="mt-3 text-xs text-muted">Free to start. No card, and no sign-up to try it.</p>
          </>
        )}
      </div>
      <div className="mx-auto mt-12 max-w-5xl">
        <HeroDiagram />
      </div>
    </section>
  );
}

const STEPS = [
  { title: 'You describe', line: 'Type an idea, paste a URL or drop a file.' },
  { title: 'AI drafts', line: 'A plan, a post, a listing or an ad, in seconds.' },
  { title: 'People finish', line: 'Your team or the BrandForge team takes it the rest of the way.' },
];

export function OverviewHow() {
  return (
    <section id="how" className="border-t border-line px-6 py-16" aria-labelledby="how-title">
      <div className="mx-auto max-w-4xl">
        <h2 id="how-title" className="text-center font-serif text-3xl tracking-[-0.02em] text-foreground sm:text-4xl">
          One chat from idea to done
        </h2>
        <div className="relative mt-12 grid gap-8 sm:grid-cols-3">
          <svg viewBox="0 0 800 20" preserveAspectRatio="none" className="pointer-events-none absolute left-[16%] right-[16%] top-5 hidden h-5 w-[68%] sm:block" aria-hidden="true">
            <path d="M0 10H800" stroke="var(--line)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <path className="bf-flow" d="M0 10H800" stroke="var(--ember)" strokeWidth="2" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" fill="none" />
          </svg>
          {STEPS.map((step, index) => (
            <div key={step.title} className="relative text-center">
              <span
                className="bf-pop relative mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-line bg-background text-sm font-semibold text-ember"
                style={{ animationDelay: `${index * 0.3}s` }}
              >
                {index + 1}
              </span>
              <h3 className="mt-4 font-serif text-lg text-foreground">{step.title}</h3>
              <p className="mx-auto mt-1 max-w-[16rem] text-sm leading-relaxed text-muted">{step.line}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Feature({ title, line, children, flip = false }: { title: string; line: string; children: React.ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-5 lg:gap-12">
      <div className={`lg:col-span-2 ${flip ? 'lg:order-2' : ''}`}>
        <h3 className="font-serif text-2xl tracking-[-0.02em] text-foreground sm:text-3xl" style={{ textWrap: 'balance' }}>
          {title}
        </h3>
        <p className="mt-3 text-base leading-relaxed text-muted">{line}</p>
      </div>
      <div className={`lg:col-span-3 ${flip ? 'lg:order-1' : ''}`}>{children}</div>
    </div>
  );
}

export function OverviewFeatures() {
  return (
    <section className="border-t border-line px-6 py-16" aria-label="What it does">
      <div className="mx-auto max-w-5xl space-y-20">
        <Feature title="Make any kind of message." line="Carousels today, with updates, polls, quizzes, threads, video and more on the way. Say it in a sentence; AI writes the first draft, you shape it.">
          <FormatsDiagram />
        </Feature>
        <Feature flip title="Publish it where people are." line="Pick the platforms and get a caption written for each. Download or copy it today; one-tap publishing opens as each platform approves us.">
          <DistributeDiagram />
        </Feature>
        <Feature title="Trade products, services and requests." line="Post what you offer or what you need. Message each other in a private chat and agree the details, with AI beside you and the BrandForge team when you want them.">
          <TradeDiagram />
        </Feature>
        <Feature flip title="Sign a contract. Pay per milestone." line="Agree scope and price in the chat. The payer approves each milestone, or it releases on its own after 48 hours. A flat 5% when it pays out.">
          <ContractDiagram />
        </Feature>
      </div>
    </section>
  );
}

export function OverviewIdea() {
  return (
    <section className="border-t border-line px-6 py-16" aria-labelledby="idea-title">
      <div className="mx-auto grid max-w-5xl items-center gap-8 lg:grid-cols-5 lg:gap-12">
        <div className="lg:col-span-2">
          <h2 id="idea-title" className="font-serif text-3xl tracking-[-0.02em] text-foreground sm:text-4xl" style={{ textWrap: 'balance' }}>
            The internet is faster with AI.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Using it without AI is becoming a disadvantage. BrandForge puts the newest internet tech to work, with people beside you, so you move faster at whatever you are into.
          </p>
        </div>
        <div className="lg:col-span-3">
          <PaceDiagram />
        </div>
      </div>
    </section>
  );
}

export function OverviewPrice() {
  const rows = [
    ['Making and publishing', 'Free to make. Sign in to edit and download.'],
    ['Teams', 'Invite anyone into a chat. Work on the same page.'],
    ['Listing in Trade', 'Free to post. Nothing is charged to list or to chat.'],
    ['Contracts between members', 'A flat 5% when a milestone is paid. Nothing else.'],
  ];
  return (
    <section className="border-t border-line px-6 py-16" aria-labelledby="price-title">
      <div className="mx-auto max-w-2xl">
        <h2 id="price-title" className="text-center font-serif text-3xl tracking-[-0.02em] text-foreground sm:text-4xl">
          Free to start. Pay when you scale.
        </h2>
        <dl className="mt-10 divide-y divide-line border-y border-line">
          {rows.map(([term, detail]) => (
            <div key={term} className="grid gap-1 py-4 sm:grid-cols-3 sm:gap-6">
              <dt className="text-sm font-medium text-foreground">{term}</dt>
              <dd className="text-sm text-muted sm:col-span-2">{detail}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 text-center">
          <Link href="/pricing" className="text-sm text-ember underline-offset-4 hover:underline">
            See plans
          </Link>
        </div>
      </div>
    </section>
  );
}

export function OverviewFinal() {
  return (
    <section className="border-t border-line px-6 py-20 text-center" aria-label="Start">
      <h2 className="mx-auto max-w-xl font-serif text-3xl tracking-[-0.02em] text-foreground sm:text-4xl" style={{ textWrap: 'balance' }}>
        Your first draft is one message away.
      </h2>
      <div className="mt-8">
        <a href="#" className="rounded-xl bg-ember px-7 py-3 text-sm font-semibold text-background transition hover:opacity-90">
          Start a chat
        </a>
      </div>
      <p className="mt-3 text-xs text-muted">Free to start. No card, and no sign-up to try it.</p>
    </section>
  );
}
