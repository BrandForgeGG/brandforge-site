import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';

export const metadata = {
  title: 'About — BrandForge',
  description:
    'BrandForge is a chat-first studio. Describe your project, get a human-vetted proposal, fund it with crypto escrow, and approve every milestone.',
};

export default function AboutPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">About</p>
        <h1 className="mt-2 font-serif text-4xl text-[#ece7de] sm:text-5xl">
          BrandForge is a chat-first studio
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-[#9aa0a6]">
          BrandForge turns one conversation into a real project. You describe what you want in
          plain language. Our AI structures it into requirements, milestones, and an estimate.
          Then a vetted human specialist joins your chat with a fixed scope, price, and timeline.
        </p>

        <div className="mt-12 space-y-8">
          <section>
            <h2 className="font-serif text-2xl text-[#ece7de]">How it works</h2>
            <p className="mt-3 leading-relaxed text-[#9aa0a6]">
              1. Describe your idea in the chat — no briefs, no forms, no calls.
            </p>
            <p className="mt-2 leading-relaxed text-[#9aa0a6]">
              2. BrandForge asks the sharp questions and turns your answers into a structured
              project.
            </p>
            <p className="mt-2 leading-relaxed text-[#9aa0a6]">
              3. A specialist joins with a fixed proposal. You fund in crypto to the BrandForge
              escrow wallet, verified on-chain. Milestone payments release only after you approve
              the delivered work.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-[#ece7de]">Who is behind it</h2>
            <p className="mt-3 leading-relaxed text-[#9aa0a6]">
              BrandForge is built by a small team of designers, developers, and reverse engineers
              who believe great work starts with a great conversation. Every project is matched
              with a specialist who has proven expertise in the relevant domain.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-[#ece7de]">Why chat-first</h2>
            <p className="mt-3 leading-relaxed text-[#9aa0a6]">
              Email threads lose context. Project management tools are overkill for getting
              started. A chat is where ideas are born — so we built the entire project lifecycle
              inside one. Your conversation becomes the project, and the project becomes the
              product.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-[#ece7de]">Escrow protection</h2>
            <p className="mt-3 leading-relaxed text-[#9aa0a6]">
              Every payment goes into a BrandForge escrow wallet. Funds are verified on-chain and
              released to the specialist only when you approve each milestone. If something goes
              wrong, the remaining funds stay with you.
            </p>
          </section>
        </div>

        <div className="mt-16 rounded-2xl border border-white/10 bg-[#1c2024] p-8 text-center">
          <p className="font-serif text-xl text-[#ece7de]">Ready to build something?</p>
          <p className="mt-2 text-sm text-[#9aa0a6]">
            Open the app and describe your first project.
          </p>
          <Link
            href="/chat"
            className="mt-6 inline-block rounded-xl bg-[#e8571e] px-6 py-3 text-sm font-semibold text-[#14171a] transition hover:opacity-95"
          >
            Open the app
          </Link>
        </div>
      </main>
    </div>
  );
}
