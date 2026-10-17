import type { Metadata } from 'next';
import { pageMeta, pageGraph } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';
import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';

const DESCRIPTION = 'BrandForge is AI and people: AI makes the first version in seconds, and a team of designers, editors, developers and marketers takes on your development, design, video and marketing, monthly or one task at a time.';
export const metadata: Metadata = pageMeta({ path: '/about', title: 'About — BrandForge', description: DESCRIPTION });

const BLOCKS: { title: string; lines: string[] }[] = [
  {
    title: 'What we do',
    lines: ['A team by the month for development, design, video and marketing, from €690.', 'Free AI tools to make videos, carousels and ads and post them everywhere yourself.', 'Trade, to hire one specialist for one job.'],
  },
  {
    title: 'How it works',
    lines: ['You chat with the team.', 'You agree what you get, and the invoice arrives in that chat.', 'You add tasks in the chat. We work through them, and you approve each one.'],
  },
  {
    title: 'What protects you',
    lines: ["A full refund if month one isn't delivered.", 'Nothing counts as delivered until you approve it.', 'Card or crypto, and you can cancel any month.'],
  },
];

export default function AboutPage() {
  return (
    <div className="bf-page">
      <JsonLd data={pageGraph({ path: '/about', name: 'About — BrandForge', description: DESCRIPTION, kind: 'AboutPage', crumbs: [{ name: 'About', path: '/about' }] })} />
      <LandingNav />
      <main>
        <section className="px-5 pb-12 pt-14 sm:px-8 sm:pt-20">
          <div className="mx-auto max-w-6xl text-center">
            <h1 className="mx-auto max-w-3xl font-serif text-5xl leading-[1.05] text-foreground sm:text-6xl" style={{ textWrap: 'balance' }}>AI and people, on the same page.</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
              ChatGPT is AI. BrandForge is AI and people. AI makes the first version in seconds, and designers, editors, developers and marketers finish it and ship it on your channels, every month.
            </p>
          </div>
        </section>

        <section className="border-t border-line px-5 py-14 sm:px-8">
          <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-3">
            {BLOCKS.map((block) => (
              <div key={block.title}>
                <h2 className="text-center font-serif text-2xl text-foreground">{block.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {block.lines.map((line) => (
                    <li key={line} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                      <span className="mt-0.5 text-ember" aria-hidden="true">&#10003;</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line px-5 py-14 sm:px-8">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="font-serif text-2xl text-foreground">Who is behind it</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              A small team of designers, developers and marketers who ship every week, with a community of more than 1,200 people on Discord. See the <Link href="/work" className="font-semibold text-foreground underline-offset-2 hover:underline">client work</Link> and <Link href="/specialists" className="font-semibold text-foreground underline-offset-2 hover:underline">the team</Link>.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/pricing" className="rounded-xl bg-ember px-6 py-3 text-base font-semibold text-on-ember transition hover:opacity-90">See plans · from €690/mo</Link>
              <Link href="/chat" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">Talk to the team</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
