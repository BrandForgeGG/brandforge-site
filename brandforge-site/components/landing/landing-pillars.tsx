const PILLARS = [
  { name: 'Projects', line: 'Research-backed plan, scope and roadmap, ready to execute with your team.' },
  { name: 'Create', line: 'Words, URLs and files into copy, images, videos and documents.' },
  { name: 'Distribute', line: 'Ready-to-run ads and posts, scheduled across your channels.' },
  { name: 'Optimize', line: 'See what worked and what to change next.' },
];

export function LandingPillars() {
  return (
    <section className="border-t border-line px-6 py-14">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center font-serif text-2xl text-foreground sm:text-3xl">
          One workspace, from idea to audience
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((pillar) => (
            <div key={pillar.name} className="rounded-2xl border border-line bg-panel p-5">
              <p className="font-serif text-lg text-ember">{pillar.name}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{pillar.line}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
