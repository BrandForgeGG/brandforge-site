import Link from 'next/link';

// The overview is the long answer to "what is this?": one promise, one diagram, real screenshots
// of the product, a plain price line. Everything it shows is the app itself.

function Shot({ src, alt, width, height, priority = false }: { src: string; alt: string; width: number; height: number; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size product screenshot, already compressed */}
      <img src={src} alt={alt} width={width} height={height} loading={priority ? 'eager' : 'lazy'} decoding="async" className="h-auto w-full" />
    </div>
  );
}

export function OverviewHero() {
  return (
    <section className="px-6 pb-10 pt-14 text-center sm:pt-20" aria-labelledby="overview-title">
      <div className="mx-auto max-w-3xl">
        <h1 id="overview-title" className="font-serif text-4xl leading-[1.08] tracking-[-0.02em] text-foreground sm:text-6xl" style={{ textWrap: 'balance' }}>
          Describe it. AI drafts it. <span className="text-ember">People ship it.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          Plans, ads and swipeable carousels in one chat. Bring your team, or hire a specialist when you want a person to finish the job.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="rounded-xl bg-ember px-6 py-3 text-sm font-semibold text-background transition hover:opacity-90">
            Start a chat
          </Link>
          <a href="#how" className="rounded-xl border border-line px-6 py-3 text-sm text-foreground transition hover:border-ember">
            See how it works
          </a>
        </div>
        <p className="mt-3 text-xs text-muted">Free to start. No card, and no sign-up to try it.</p>
      </div>
      <div className="mx-auto mt-12 max-w-5xl">
        <Shot src="/overview/chat-forge-desktop.png" alt="A BrandForge chat with a researched two-week launch plan for a coffee roaster" width={2880} height={1800} priority />
      </div>
    </section>
  );
}

const STEPS = [
  { title: 'You describe', line: 'Type an idea, paste a URL or drop a file.' },
  { title: 'AI drafts', line: 'A researched plan, ad copy or a swipeable carousel, in seconds.' },
  { title: 'People finish', line: 'Invite your team or bring in a vetted specialist. Agree milestones in a contract.' },
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
        <Feature title="Pick a format. Get a first version." line="Logos to posters, TikToks to explainers, ad angles to investor updates. One tap fills the form; everything stays yours to edit.">
          <Shot src="/overview/create-forge-desktop.png" alt="The Create page with the format picker open on merchandise and a t-shirt graphic selected" width={2880} height={1800} />
        </Feature>
        <Feature flip title="Ads, a calendar and a launch plan, from your URL." line="Paste your site. Get hooks and copy per platform, a 30-day calendar as a table you can copy into a spreadsheet, and a day-by-day launch.">
          <Shot src="/overview/distribute-forge-desktop.png" alt="The Distribute page with the ad pack tool" width={2880} height={1800} />
        </Feature>
        <Feature title="Sign a contract. Pay per milestone." line="Agree scope and price in the chat. The payer approves each milestone, or it releases on its own after 48 hours. A flat 5% when it pays out.">
          <Shot src="/overview/contract-forge-desktop.png" alt="A milestone contract between two members inside a chat, one milestone released and one waiting for approval" width={2880} height={1800} />
        </Feature>
      </div>
    </section>
  );
}

export function OverviewThemes() {
  const themes = [
    { src: '/overview/start-forge-desktop.png', name: 'Forge', note: 'Fire orange' },
    { src: '/overview/start-crystal-desktop.png', name: 'Crystal', note: 'Crystal blue' },
    { src: '/overview/start-mono-desktop.png', name: 'Black and white', note: 'Plain and quiet' },
  ];
  return (
    <section className="border-t border-line px-6 py-16" aria-labelledby="themes-title">
      <div className="mx-auto max-w-5xl">
        <h2 id="themes-title" className="text-center font-serif text-3xl tracking-[-0.02em] text-foreground sm:text-4xl">
          Make it yours
        </h2>
        <p className="mx-auto mt-3 max-w-md text-center text-sm text-muted">Three looks, one tap in Settings. Your choice is remembered.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {themes.map((theme) => (
            <figure key={theme.name}>
              <Shot src={theme.src} alt={`The BrandForge start screen in the ${theme.name} theme`} width={2880} height={1800} />
              <figcaption className="mt-3 text-center text-sm text-foreground">
                {theme.name} <span className="text-muted">· {theme.note}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OverviewPrice() {
  const rows = [
    ['Carousels and plans', 'Free to make. Sign in to edit and download.'],
    ['Teams', 'Invite anyone into a chat. Work on the same page.'],
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
        <Link href="/" className="rounded-xl bg-ember px-7 py-3 text-sm font-semibold text-background transition hover:opacity-90">
          Start a chat
        </Link>
      </div>
      <p className="mt-3 text-xs text-muted">Free to start. No card, and no sign-up to try it.</p>
    </section>
  );
}
