import { ServiceTile, type ServiceId } from '@/components/integrations/brand-icons';

// Small playful scenes that show how BrandForge works instead of screenshots of it. Pure CSS and SVG:
// nothing to download, they follow the theme, and the motion stops for people who ask for less of it.

function Frame({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="img" aria-label={label} className={`relative overflow-hidden rounded-2xl border border-line bg-panel ${className}`}>
      <div className="bf-dots pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

// A mini slide: a cover (hook and art) or an item (number and three lines).
function Slide({ kind, n, tilt = 0, delay = 0, hue = 'var(--ember)' }: { kind: 'cover' | 'item' | 'end'; n?: number; tilt?: number; delay?: number; hue?: string }) {
  return (
    <div
      className="bf-float relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-background shadow-lg sm:w-28"
      style={{ transform: `rotate(${tilt}deg)`, animationDelay: `${delay}s` }}
    >
      {kind === 'cover' ? (
        <>
          <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 70% 25%, ${hue}, transparent 55%), linear-gradient(160deg, #1b1b1b, #000)` }} />
          <div className="absolute inset-x-2 bottom-3 space-y-1">
            <div className="h-2 w-5/6 rounded-sm bg-white/90" />
            <div className="h-2 w-3/5 rounded-sm" style={{ background: hue }} />
            <div className="mt-1.5 h-1 w-2/5 rounded-full bg-white/40" />
          </div>
        </>
      ) : kind === 'item' ? (
        <div className="absolute inset-0 p-2.5">
          <p className="font-serif text-2xl leading-none text-ember">{n}</p>
          <div className="mt-2 space-y-1.5">
            {['w-4/5', 'w-full', 'w-3/5'].map((w, i) => (
              <div key={i} className={`h-1.5 rounded-full bg-foreground/25 ${w}`} />
            ))}
          </div>
          <div className="absolute inset-x-2.5 bottom-2.5 h-1 rounded-full bg-ember/60" />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2.5 text-center">
          <div className="h-1.5 w-4/5 rounded-full bg-foreground/30" />
          <div className="rounded-full bg-ember px-3 py-1 text-[8px] font-bold text-background">Follow</div>
        </div>
      )}
    </div>
  );
}

function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 16" className={`h-4 w-12 shrink-0 text-muted ${className}`} fill="none" aria-hidden="true">
      <path className="bf-flow" d="M2 8h50" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1" pathLength={1} />
      <path d="M46 2l9 6-9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Idea in, carousel out, posted. The overview hero. */
export function HeroDiagram() {
  const channels: ServiceId[] = ['telegram', 'discord', 'bluesky'];
  return (
    <Frame label="An idea typed in a chat becomes a fan of carousel slides, which are posted to Telegram, Discord and Bluesky" className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col items-center justify-center gap-6 md:flex-row md:gap-5">
        <div className="w-full max-w-[15rem] rounded-2xl rounded-bl-sm border border-line bg-background p-3.5 text-left shadow-md">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted">You</p>
          <p className="mt-1 text-sm text-foreground">5 habits of calm teams</p>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="bf-dot h-1.5 w-1.5 rounded-full bg-ember" style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        </div>
        <Arrow className="rotate-90 md:rotate-0" />
        <div className="relative flex h-44 items-center justify-center sm:h-48" style={{ width: 'min(21rem, 100%)' }}>
          <div className="absolute left-0"><Slide kind="cover" tilt={-9} /></div>
          <div className="absolute left-1/2 z-10 -translate-x-1/2"><Slide kind="item" n={1} tilt={0} delay={0.4} /></div>
          <div className="absolute right-0"><Slide kind="end" tilt={9} delay={0.8} /></div>
        </div>
        <Arrow className="rotate-90 md:rotate-0" />
        <div className="flex gap-2.5 md:flex-col">
          {channels.map((id, i) => (
            <div key={id} className="relative">
              <ServiceTile id={id} on size={44} />
              <span className="bf-pop absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-success text-[9px] font-bold text-background" style={{ animationDelay: `${0.8 + i * 0.3}s` }}>✓</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** One sentence in, a whole swipeable post out. */
export function CarouselDiagram() {
  return (
    <Frame label="A sentence is typed, then a cover slide and numbered slides appear one after another" className="p-5 sm:p-7">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-background px-3.5 py-2.5">
        <span className="text-ember" aria-hidden="true">✎</span>
        <span className="bf-type min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm text-foreground">Why every small shop needs a newsletter</span>
        <span className="rounded-lg bg-ember px-2.5 py-1 text-[11px] font-semibold text-background">Make</span>
      </div>
      <div className="mt-5 flex items-end justify-center gap-3 overflow-hidden sm:gap-4">
        <Slide kind="cover" delay={0} />
        <Slide kind="item" n={1} delay={0.3} />
        <Slide kind="item" n={2} delay={0.6} />
        <div className="hidden sm:block"><Slide kind="item" n={3} delay={0.9} /></div>
        <div className="hidden md:block"><Slide kind="end" delay={1.2} /></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted" aria-hidden="true">
        {['#ff6a2b', '#7fc4ff', '#a78bfa', '#34d399', '#fb7185', '#fbbf24'].map((c) => (
          <span key={c} className="h-4 w-4 rounded-full border border-line" style={{ background: c }} />
        ))}
        <span>pick a look</span>
      </div>
    </Frame>
  );
}

/** One carousel, many places. Connected ones are lit, the rest wait for approval. */
export function DistributeDiagram() {
  const spokes: { id: ServiceId; on: boolean; x: string; y: string }[] = [
    { id: 'telegram', on: true, x: '14%', y: '22%' },
    { id: 'discord', on: true, x: '14%', y: '72%' },
    { id: 'bluesky', on: true, x: '50%', y: '80%' },
    { id: 'instagram', on: false, x: '86%', y: '72%' },
    { id: 'linkedin', on: false, x: '86%', y: '22%' },
    { id: 'tiktok', on: false, x: '50%', y: '16%' },
  ];
  return (
    <Frame label="One carousel in the middle with lines to Telegram, Discord and Bluesky, which are connected, and Instagram, LinkedIn and TikTok, which are waiting for approval" className="h-80 sm:h-[22rem]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {spokes.map((s) => (
          <line key={s.id} x1="50" y1="50" x2={parseFloat(s.x)} y2={parseFloat(s.y)} stroke={s.on ? 'var(--ember)' : 'var(--line)'} strokeWidth="1.2" strokeDasharray={s.on ? undefined : '4 4'} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"><Slide kind="cover" delay={0} /></div>
      {spokes.map((s, i) => (
        <div key={s.id} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: s.x, top: s.y }}>
          <div className="relative inline-block">
            <ServiceTile id={s.id} on={s.on} size={40} />
            {s.on ? <span className="bf-pop absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-success text-[9px] font-bold text-background" style={{ animationDelay: `${0.5 + i * 0.25}s` }}>✓</span> : null}
          </div>
          <p className={`mt-1 text-[10px] ${s.on ? 'text-foreground' : 'text-muted'}`}>{s.on ? 'Connected' : 'Soon'}</p>
        </div>
      ))}
    </Frame>
  );
}

/** A contract with three milestones, money moving as each lands. */
export function ContractDiagram() {
  const steps = [
    { name: 'Brand pack', state: 'Paid', done: true },
    { name: 'Landing page', state: 'In review', done: false, live: true },
    { name: 'Launch posts', state: 'Waiting', done: false },
  ];
  return (
    <Frame label="A contract with three milestones: the first is paid, the second is in review and the third is waiting" className="p-5 sm:p-7">
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-1.5"><span aria-hidden="true">🔒</span> Held until you approve</span>
        <span>Flat 5% when paid out</span>
      </div>
      <ol className="relative mt-6 grid grid-cols-3 gap-3">
        <span aria-hidden="true" className="absolute left-[16%] right-[16%] top-4 h-0.5 rounded-full bg-line" />
        <span aria-hidden="true" className="bf-grow absolute left-[16%] top-4 h-0.5 w-[34%] rounded-full bg-ember" />
        {steps.map((s) => (
          <li key={s.name} className="relative text-center">
            <span className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${s.done ? 'border-ember bg-ember text-background' : s.live ? 'bf-pulse border-ember bg-background text-ember' : 'border-line bg-background text-muted'}`}>
              {s.done ? '✓' : s.live ? '…' : ''}
            </span>
            <p className="mt-2 text-xs font-medium text-foreground">{s.name}</p>
            <p className={`text-[11px] ${s.done ? 'text-success' : s.live ? 'text-ember' : 'text-muted'}`}>{s.state}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-xs text-muted">
        <span className="bf-coin inline-block" aria-hidden="true">🪙</span>
        Approve a milestone and the money moves. Do nothing for 48 hours and it releases on its own.
      </div>
    </Frame>
  );
}
