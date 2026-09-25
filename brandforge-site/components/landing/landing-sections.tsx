const STEPS = [
  {
    title: 'Say what you want',
    body: 'Drop one sentence into the chat. No briefs, no forms, no calls to get started.',
  },
  {
    title: 'Watch it take shape',
    body: 'BrandForge asks the sharp questions and turns your answers into a structured project: requirements, milestones, estimate.',
  },
  {
    title: 'Get a human proposal',
    body: 'A BrandForge specialist joins the same chat with fixed scope, a fixed price and a timeline.',
  },
  {
    title: 'Fund it, then approve it',
    body: 'You fund the project in crypto to the BrandForge escrow wallet. Our team verifies the transfer on-chain, holds the funds, and releases each milestone payment only when you approve the delivered work.',
  },
];

const SERVICES = [
  {
    name: 'Design',
    body: 'Brand identity, landing pages, full UI/UX, motion and video content.',
  },
  {
    name: 'Development',
    body: 'Websites, web apps and mobile apps, integrations, AI features end to end.',
  },
  {
    name: 'Reverse engineering',
    body: 'APIs, protocols and integrations others said were impossible — mapped and built on.',
  },
  {
    name: 'Marketing',
    body: 'AI-assisted content, SEO, social growth and campaign launches.',
  },
];

export function LandingSections() {
  return (
    <>
      <section id="process" className="bf-section" aria-labelledby="process-title">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">How it works</p>
          <h2 className="mt-2 font-serif text-3xl text-[#ece7de] sm:text-4xl">
            The chat becomes the project
          </h2>

          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((step, index) => (
              <div key={step.title} className="bg-[#14171a] p-6">
                <p className="font-serif text-sm text-[#b8763b]">{String(index + 1).padStart(2, '0')}</p>
                <h3 className="mt-2 font-serif text-lg text-[#ece7de]">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#9aa0a6]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="bf-section">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Specialists</p>
          <h2 className="mt-2 font-serif text-3xl text-[#ece7de] sm:text-4xl">
            Vetted people, not a marketplace
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#9aa0a6]">
            Every project is matched with a BrandForge specialist and tracked inside your chat. Here
            is what the crew covers.
          </p>

          <div className="mt-10 space-y-0 overflow-hidden rounded-2xl border border-white/10">
            {SERVICES.map((service) => (
              <div
                key={service.name}
                className="flex flex-col gap-2 border-b border-white/10 bg-[#1c2024] p-6 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-10"
              >
                <h3 className="shrink-0 font-serif text-xl text-[#ece7de] sm:w-64">{service.name}</h3>
                <p className="text-sm leading-relaxed text-[#9aa0a6]">{service.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-[#5aa578]/30 bg-[#5aa578]/10 p-6">
            <p className="text-sm leading-relaxed text-[#d9f7ea]">
              <span className="font-semibold">Admin-verified crypto escrow.</span> You pay in crypto
              to a wallet held by BrandForge. Our team confirms your transfer on-chain and releases
              funds to the specialist only after you approve the delivered work — you never pay
              upfront for promises.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
