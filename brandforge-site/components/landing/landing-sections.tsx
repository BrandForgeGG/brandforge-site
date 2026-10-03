const STEPS = [
  {
    num: '01',
    title: 'Tell us',
    body: "Describe what you're trying to build.",
  },
  {
    num: '02',
    title: 'BrandForge structures it',
    body: 'AI turns the conversation into requirements, scope and milestones.',
  },
  {
    num: '03',
    title: 'A specialist takes over',
    body: 'A vetted specialist reviews the project and sends the proposal.',
  },
  {
    num: '04',
    title: 'You approve & fund',
    body: 'Accept the proposal and fund the agreed work.',
  },
  {
    num: '05',
    title: 'We build',
    body: 'Your specialist works inside the project.',
  },
  {
    num: '06',
    title: 'You approve delivery',
    body: 'Milestones are reviewed before payment is released.',
  },
];

export function LandingSections() {
  return (
    <section id="process" className="border-t border-line px-6 py-20">
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">From idea → shipped</p>
          <h2 className="mt-2 font-serif text-3xl text-foreground sm:text-4xl">
            How BrandForge works
          </h2>
        </div>

        <div className="mt-12">
          {STEPS.map((step, index) => (
            <div key={step.num}>
              <div className="flex gap-5">
                <div className="flex flex-col items-center">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-panel font-serif text-sm text-ember">
                    {step.num}
                  </span>
                  {index < STEPS.length - 1 && (
                    <div className="mt-2 w-px flex-1 bg-line" />
                  )}
                </div>
                <div className="pb-10">
                  <h3 className="font-serif text-xl text-foreground">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
