import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';

export const metadata = {
  title: 'About — BrandForge',
  description:
    "BrandForge is where AI and people work on the same page: make and publish every kind of message, and trade products, services and requests.",
};

export default function AboutPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl">
          AI and people, on the same page.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          ChatGPT is AI. BrandForge is AI and people. You say what you want in plain language, AI
          drafts it in seconds, and then you, your team or a vetted specialist take it the rest of
          the way. Make every kind of message and publish it. Trade products, services and requests.
        </p>

        <div className="mt-12 space-y-8">
          <section>
            <h2 className="font-serif text-2xl text-foreground">Why now</h2>
            <p className="mt-3 leading-relaxed text-muted">
              Using the internet without AI is becoming a disadvantage. We use the newest internet
              technology to speed up whatever you are into, and keep people in the loop so the
              result is something you would put your name on.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">How it works</h2>
            <p className="mt-3 leading-relaxed text-muted">
              1. Describe your idea in the chat — no briefs, no forms, no calls.
            </p>
            <p className="mt-2 leading-relaxed text-muted">
              2. BrandForge asks the sharp questions and turns your answers into a structured
              project.
            </p>
            <p className="mt-2 leading-relaxed text-muted">
              3. Invite your team, or bring in a specialist with a priced proposal. Money moves
              milestone by milestone, only when the person paying approves the work.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">Who is behind it</h2>
            <p className="mt-3 leading-relaxed text-muted">
              BrandForge is built by a small team of designers, developers, and reverse engineers
              who believe great work starts with a great conversation. Every project is matched
              with a specialist who has proven expertise in the relevant domain.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">Why chat-first</h2>
            <p className="mt-3 leading-relaxed text-muted">
              Email threads lose context. Project management tools are overkill for getting
              started. A chat is where ideas are born — so we built the entire project lifecycle
              inside one. Your conversation becomes the project, and the project becomes the
              product.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">Escrow protection</h2>
            <p className="mt-3 leading-relaxed text-muted">
              Every payment goes into a BrandForge escrow wallet. Funds are verified on-chain and
              released to the specialist only when you approve each milestone. If something goes
              wrong, the remaining funds stay with you.
            </p>
          </section>
        </div>

        <div className="mt-16 rounded-2xl border border-line bg-panel p-8 text-center">
          <p className="font-serif text-xl text-foreground">Ready to build something?</p>
          <p className="mt-2 text-sm text-muted">
            Open the app and describe your first project.
          </p>
          <Link
            href="/chat"
            className="mt-6 inline-block rounded-xl bg-ember px-6 py-3 text-sm font-semibold text-background transition hover:opacity-95"
          >
            Open the app
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
