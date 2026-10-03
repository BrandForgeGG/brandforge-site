export function LandingAiFlow() {
  return (
    <section className="border-t border-line px-6 py-20">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">How BrandForge works</p>
        <h2 className="mt-2 font-serif text-3xl text-foreground sm:text-4xl">
          AI coordinates the work. Humans are accountable for it.
        </h2>

        <div className="mx-auto mt-12 max-w-sm">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-muted">Your idea</p>
          </div>
          <div className="mx-auto h-6 w-px bg-line" />

          <div className="rounded-2xl border border-ember/40 bg-ember/10 p-5">
            <p className="font-serif text-lg text-ember">BrandForge AI</p>
            <p className="mt-1 text-xs text-muted">Structures requirements, scope & milestones</p>
          </div>
          <div className="mx-auto h-6 w-px bg-line" />

          <div className="rounded-2xl border border-line bg-panel p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-muted">Structured project</p>
          </div>
          <div className="mx-auto h-6 w-px bg-line" />

          <div className="grid grid-cols-3 gap-2">
            {['Design', 'Dev', 'Growth'].map((role) => (
              <div key={role} className="rounded-xl border border-line bg-panel p-3">
                <p className="text-sm text-foreground">{role}</p>
              </div>
            ))}
          </div>
          <div className="mx-auto h-6 w-px bg-line" />

          <div className="rounded-2xl border border-ember/40 bg-ember/10 p-5">
            <p className="font-serif text-lg text-ember">Shipped</p>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-md text-sm text-muted">
          You don&apos;t search through 400 profiles. BrandForge assembles the team around your project.
        </p>
      </div>
    </section>
  );
}
