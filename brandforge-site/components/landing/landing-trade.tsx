import Link from 'next/link';

// Short on purpose: one headline, a four-step strip that animates once, one button.
const STEPS = [
  { label: 'List', hint: 'what you offer or need' },
  { label: 'Chat', hint: 'privately, with the AI helping' },
  { label: 'Sign', hint: 'milestones both agree' },
  { label: 'Get paid', hint: 'as each one is approved' },
];

export function LandingTrade() {
  return (
    <section className="border-t border-line px-6 py-14" aria-label="Trade Center">
      <div className="mx-auto max-w-5xl text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Trade Center</p>
        <h2 className="mt-2 font-serif text-3xl text-foreground sm:text-4xl">Hire, or get hired. Paid per milestone.</h2>
        <ol className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.label} className="rounded-2xl border border-line bg-panel p-4 text-left">
              <span
                className="bf-pop flex h-6 w-6 items-center justify-center rounded-full bg-ember/15 text-[11px] font-semibold text-ember"
                style={{ animationDelay: `${index * 0.25}s` }}
              >
                {index + 1}
              </span>
              <p className="mt-3 font-serif text-base text-foreground">{step.label}</p>
              <p className="text-xs text-muted">{step.hint}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/trade" className="rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-background">
            Browse the Trade Center
          </Link>
          <span className="text-xs text-muted">A flat 5% only when a milestone is paid.</span>
        </div>
      </div>
    </section>
  );
}
