// One idea fans out into four things you can ship. The visuals are small SVG/CSS
// scenes (no images to load); motion lives in globals.css and is disabled for
// reduced-motion users.

function Visual({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-panel-2"
    >
      {children}
    </div>
  );
}

function ProjectsVisual() {
  return (
    <Visual label="A roadmap with three milestones filling in">
      <div className="absolute inset-0 flex flex-col justify-center gap-3 px-5">
        {[
          ['w-[78%]', '0s'],
          ['w-[56%]', '0.25s'],
          ['w-[34%]', '0.5s'],
        ].map(([width, delay], index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-ember" />
            <div className="h-2.5 flex-1 rounded-full bg-line">
              <div
                className={`bf-grow h-full rounded-full bg-ember/80 ${width}`}
                style={{ animationDelay: delay }}
              />
            </div>
          </div>
        ))}
      </div>
    </Visual>
  );
}

function CreateVisual() {
  return (
    <Visual label="A video frame with a play button and caption lines">
      <div className="absolute inset-x-5 top-5 flex h-[58%] items-center justify-center rounded-lg bg-gradient-to-br from-ember/30 via-ember/10 to-transparent">
        <span className="bf-pulse flex h-9 w-9 items-center justify-center rounded-full bg-background/70">
          <svg viewBox="0 0 20 20" className="h-4 w-4 translate-x-px fill-ember" aria-hidden="true">
            <path d="M6 3.5v13l11-6.5z" />
          </svg>
        </span>
      </div>
      <div className="absolute inset-x-5 bottom-5 space-y-2">
        <div className="h-2 w-4/5 rounded-full bg-line" />
        <div className="h-2 w-3/5 rounded-full bg-line" />
      </div>
    </Visual>
  );
}

function DistributeVisual() {
  const rows = [
    ['X', '#e8571e'],
    ['in', '#229ED9'],
    ['Ig', '#b8763b'],
  ];
  return (
    <Visual label="Posts being scheduled across three channels">
      <div className="absolute inset-0 flex flex-col justify-center gap-2.5 px-5">
        {rows.map(([name, color], index) => (
          <div key={name} className="flex items-center gap-2.5">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-background"
              style={{ background: color }}
            >
              {name}
            </span>
            <div className="h-2.5 flex-1 rounded-full bg-line" />
            <svg
              viewBox="0 0 16 16"
              className="bf-pop h-4 w-4 shrink-0"
              style={{ animationDelay: `${0.4 + index * 0.35}s` }}
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="8" fill="var(--trust)" />
              <path d="M4.5 8.2l2.3 2.3 4.7-4.8" fill="none" stroke="var(--background)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ))}
      </div>
    </Visual>
  );
}

function OptimizeVisual() {
  return (
    <Visual label="A line chart trending upward">
      <svg viewBox="0 0 200 150" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {[40, 75, 110].map((y) => (
          <line key={y} x1="16" x2="184" y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />
        ))}
        <path
          className="bf-draw"
          pathLength={1}
          d="M16 118 C46 112 58 96 82 100 S122 70 142 56 S170 38 184 30"
          fill="none"
          stroke="var(--ember)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle className="bf-pop" style={{ animationDelay: '1.2s' }} cx="184" cy="30" r="4" fill="var(--ember)" />
      </svg>
    </Visual>
  );
}

const PILLARS = [
  { name: 'Projects', line: 'Plan with research', visual: <ProjectsVisual /> },
  { name: 'Create', line: 'Swipeable carousels', visual: <CreateVisual /> },
  { name: 'Distribute', line: 'Every channel', visual: <DistributeVisual /> },
  { name: 'Optimize', line: 'Know what works', visual: <OptimizeVisual /> },
];

export function LandingPillars() {
  return (
    <section className="border-t border-line px-6 py-14" aria-label="What you get">
      <div className="mx-auto max-w-5xl">
        <svg
          viewBox="0 0 800 56"
          preserveAspectRatio="none"
          className="mx-auto hidden h-12 w-full lg:block"
          aria-hidden="true"
        >
          {[100, 300, 500, 700].map((x) => (
            <path
              key={x}
              d={`M400 0 C400 30 ${x} 26 ${x} 56`}
              fill="none"
              stroke="var(--line)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {[100, 300, 500, 700].map((x, index) => (
            <path
              key={`p${x}`}
              className="bf-flow"
              style={{ animationDelay: `${index * 0.4}s` }}
              d={`M400 0 C400 30 ${x} 26 ${x} 56`}
              fill="none"
              stroke="var(--ember)"
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {PILLARS.map((pillar) => (
            <div key={pillar.name} className="rounded-2xl border border-line bg-panel p-3">
              {pillar.visual}
              <p className="mt-3 px-1 font-serif text-base text-foreground">{pillar.name}</p>
              <p className="px-1 text-xs text-muted">{pillar.line}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
