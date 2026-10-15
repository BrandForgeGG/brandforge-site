import Link from 'next/link';
import { HeroSignIn } from '@/components/landing/hero-signin';
import { ImageSampleVisual } from '@/components/studio/image-sample-visual';
import type { ImageKind } from '@/lib/image-kinds.js';

// The front page, short on purpose: who we are with a way in, the three things you do here (shown with real work from
// members where there is some), what it costs. Every section ends in one obvious next step.

type Creation = { id: string; title: string; image: string | null; video: boolean };
type Published = { id: string; network: string; url: string; caption: string; thumb: string };
type Person = { handle: string; name: string; headline: string };

const NETWORKS: { name: string; color: string }[] = [
  { name: 'LinkedIn', color: '#0a66c2' },
  { name: 'YouTube', color: '#ff0033' },
  { name: 'Bluesky', color: '#1185fe' },
  { name: 'Telegram', color: '#229ed9' },
  { name: 'Discord', color: '#5865f2' },
  { name: 'Mastodon', color: '#6364ff' },
  { name: 'Tumblr', color: '#36465d' },
];

const SAMPLE_KINDS: ImageKind[] = ['ad', 'quote', 'announcement', 'tip'];

function Eyebrow({ hue, children }: { hue: 'create' | 'distribute' | 'trade'; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm font-medium" style={{ color: `var(--hue-${hue})` }}>
      <span className="h-2 w-2 rounded-full" style={{ background: `var(--hue-${hue})` }} aria-hidden="true" />
      {children}
    </p>
  );
}

function Cta({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold transition ${primary ? 'bg-ember text-on-ember hover:opacity-90' : 'border border-line text-foreground hover:border-ember'}`}>
      {children}
    </Link>
  );
}

export function HomeHero() {
  return (
    <section className="px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <h1 className="font-serif text-5xl leading-[1.02] text-foreground sm:text-6xl lg:text-7xl" style={{ textWrap: 'balance' }}>
            Meet Brand<span className="text-ember">Forge</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
            Make it, post it everywhere, and get real people on it when you need them. One chat, read by the BrandForge team.
          </p>
          <ul className="mt-7 space-y-2.5 text-[15px] text-foreground">
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--hue-create)]" aria-hidden="true" />Launch videos, carousels, ads and articles in your own colours, in minutes.</li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--hue-distribute)]" aria-hidden="true" />Post now or schedule a week on LinkedIn, YouTube, Bluesky, Telegram and more.</li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--hue-trade)]" aria-hidden="true" />Hire a designer, developer or marketer, and pay per milestone.</li>
          </ul>
        </div>
        <HeroSignIn />
      </div>
    </section>
  );
}

export function HomeCreate({ creations }: { creations: Creation[] }) {
  const withPictures = creations.filter((c) => c.image);
  // An even grid: four when there are four, otherwise two.
  const real = withPictures.slice(0, withPictures.length >= 4 ? 4 : 2);
  return (
    <section id="create" className="border-t border-line px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <Eyebrow hue="create">Create</Eyebrow>
          <h2 className="mt-3 font-serif text-4xl leading-tight text-foreground sm:text-5xl">Create with BrandForge</h2>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted">
            Paste your website and get a narrated launch video in your colours. Or a carousel, an ad, a quote, an article. Every piece is edited in its own chat, version by version.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Cta href="/create" primary>Make something</Cta>
            <Cta href="/create">See what members made</Cta>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {real.length >= 2
            ? real.map((c) => (
                <Link key={c.id} href="/create" className="group relative block aspect-square overflow-hidden rounded-2xl border border-line bg-panel">
                  {/* eslint-disable-next-line @next/next/no-img-element -- member pictures from our own public bucket */}
                  <img src={c.image as string} alt={c.title || 'A member creation'} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                  {c.video ? <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">Video</span> : null}
                </Link>
              ))
            : SAMPLE_KINDS.map((kind) => (
                <div key={kind} className="overflow-hidden rounded-2xl">
                  <ImageSampleVisual kind={kind} />
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}

export function HomeDistribute({ published }: { published: Published[] }) {
  const recent = published.slice(0, 3);
  return (
    <section id="distribute" className="border-t border-line px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="lg:order-2">
          <Eyebrow hue="distribute">Distribute</Eyebrow>
          <h2 className="mt-3 font-serif text-4xl leading-tight text-foreground sm:text-5xl">Distribute with BrandForge</h2>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted">
            Connect your channels once. Post what you made right away, or let BrandForge write and schedule a whole week, pictures included.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Cta href="/distribute" primary>Plan my week</Cta>
          </div>
        </div>
        <div className="space-y-3 lg:order-1">
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((network) => (
              <span key={network.name} className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-2 text-sm text-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: network.color }} aria-hidden="true" />
                {network.name}
              </span>
            ))}
          </div>
          {recent.length ? (
            <ul className="space-y-2 pt-2">
              {recent.map((post) => (
                <li key={post.id}>
                  <a href={post.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-3 transition hover:border-ember">
                    {post.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a member's post picture
                      <img src={post.thumb} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="h-12 w-12 shrink-0 rounded-lg bg-overlay" aria-hidden="true" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">{post.caption || 'A post'}</span>
                      <span className="block text-xs capitalize text-muted">Just published on {post.network}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function HomeCollaborate({ people }: { people: Person[] }) {
  const shown = people.slice(0, 4);
  return (
    <section id="people" className="border-t border-line px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <Eyebrow hue="trade">People</Eyebrow>
          <h2 className="mt-3 font-serif text-4xl leading-tight text-foreground sm:text-5xl">Collaborate with people</h2>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted">
            Every chat is read by the official BrandForge team. Want someone specific? Pick a profile in Trade, agree the work in a chat, sign a contract and pay per milestone.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Cta href="/trade" primary>Browse Trade</Cta>
            <Cta href="/chat">Talk to the team</Cta>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.length
            ? shown.map((person) => (
                <Link key={person.handle} href={`/specialists/${person.handle}`} className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-4 transition hover:border-ember">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--hue-trade)_14%,transparent)] font-serif text-lg text-[var(--hue-trade)]" aria-hidden="true">
                    {person.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{person.name}</span>
                    <span className="block truncate text-xs text-muted">{person.headline || 'BrandForge team'}</span>
                  </span>
                </Link>
              ))
            : null}
          <div className="rounded-2xl border border-dashed border-line p-4 sm:col-span-2">
            <p className="text-sm text-foreground">A contract you both sign, money held until you approve each milestone, and a flat 5% fee when it is paid. Nothing else.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomePricing() {
  const plans = [
    { name: 'Free', price: '€0', line: 'Make, publish and trade. Fast AI models.', href: '/chat', cta: 'Start free' },
    { name: 'Pro', price: '€19/mo', line: 'The strongest AI on everything you make.', href: '/pricing', cta: 'See Pro', highlight: true },
    { name: 'A team', price: 'from €490/mo', line: 'People who deliver for you every month.', href: '/pricing', cta: 'See team plans' },
  ];
  return (
    <section id="pricing" className="border-t border-line px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-serif text-4xl text-foreground sm:text-5xl">Pricing</h2>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {plans.map((plan) => (
            <Link key={plan.name} href={plan.href} className={`flex flex-col rounded-3xl border p-6 transition hover:border-ember ${plan.highlight ? 'border-ember bg-panel' : 'border-line bg-panel/70'}`}>
              <span className="font-serif text-2xl text-foreground">{plan.name}</span>
              <span className="mt-1 text-sm text-muted">{plan.line}</span>
              <span className="mt-6 font-serif text-3xl text-foreground">{plan.price}</span>
              <span className={`mt-5 text-sm font-semibold ${plan.highlight ? 'text-ember' : 'text-foreground'}`}>{plan.cta} →</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
