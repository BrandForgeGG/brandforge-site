// Small live scenes for the cards on Create: each one shows the thing you are about to make, moving a
// little. Pure CSS (the motion utilities live in globals.css and stop for reduced-motion), no images.

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className="relative flex aspect-[5/3] items-center justify-center overflow-hidden rounded-xl border border-line bg-background">
      <div className="bf-dots pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative">{children}</div>
    </div>
  );
}

function Mini({ tilt, delay, hue, children }: { tilt: number; delay: number; hue?: string; children?: React.ReactNode }) {
  return (
    <div className="bf-float absolute top-1/2 h-20 w-14 -translate-y-1/2 overflow-hidden rounded-md border border-line bg-panel shadow-md sm:h-24 sm:w-[4.5rem]" style={{ transform: `translateY(-50%) rotate(${tilt}deg)`, animationDelay: `${delay}s`, left: `calc(50% + ${tilt * 6}px - 2rem)`, background: hue ? `radial-gradient(circle at 70% 25%, ${hue}, transparent 60%), #0b0b0b` : undefined }}>
      {children}
    </div>
  );
}

export function CarouselVisual() {
  return (
    <Stage>
      <div className="relative h-24 w-40">
        <Mini tilt={-9} delay={0} hue="var(--ember)">
          <div className="absolute inset-x-1.5 bottom-2 space-y-1"><div className="h-1.5 w-5/6 rounded-sm bg-white/90" /><div className="h-1.5 w-3/5 rounded-sm bg-ember" /></div>
        </Mini>
        <Mini tilt={0} delay={0.4}>
          <div className="p-1.5"><p className="font-serif text-lg leading-none text-ember">1</p><div className="mt-1.5 space-y-1">{['w-4/5', 'w-full', 'w-3/5'].map((w) => <div key={w} className={`h-1 rounded-full bg-foreground/25 ${w}`} />)}</div></div>
        </Mini>
        <Mini tilt={9} delay={0.8}>
          <div className="flex h-full flex-col items-center justify-center gap-1.5"><div className="h-1 w-3/5 rounded-full bg-foreground/30" /><div className="rounded-full bg-ember px-2 py-0.5 text-[6px] font-bold text-background">Follow</div></div>
        </Mini>
      </div>
    </Stage>
  );
}

export function UpdateVisual() {
  return (
    <Stage>
      <div className="w-40 rounded-xl border border-line bg-panel p-3 shadow-md">
        <div className="flex items-center gap-1.5"><span className="h-4 w-4 rounded-full bg-ember" /><span className="h-1.5 w-12 rounded-full bg-foreground/30" /></div>
        <div className="mt-2.5 space-y-1.5">
          <div className="bf-grow h-1.5 w-full rounded-full bg-foreground/25" />
          <div className="bf-grow h-1.5 w-11/12 rounded-full bg-ember/70" style={{ animationDelay: '0.2s' }} />
          <div className="bf-grow h-1.5 w-3/5 rounded-full bg-foreground/25" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </Stage>
  );
}

export function PollVisual() {
  const bars = [['w-4/5', '0s'], ['w-3/5', '0.25s'], ['w-2/5', '0.5s']];
  return (
    <Stage>
      <div className="w-40 space-y-2 rounded-xl border border-line bg-panel p-3 shadow-md">
        <div className="h-1.5 w-3/4 rounded-full bg-foreground/40" />
        {bars.map(([w, delay], i) => (
          <div key={i} className="h-3.5 rounded-md bg-overlay"><div className={`bf-grow h-full rounded-md ${i === 0 ? 'bg-ember' : 'bg-ember/40'} ${w}`} style={{ animationDelay: delay }} /></div>
        ))}
      </div>
    </Stage>
  );
}

export function QuizVisual() {
  return (
    <Stage>
      <div className="w-40 space-y-1.5 rounded-xl border border-line bg-panel p-3 shadow-md">
        <div className="mb-2 h-1.5 w-2/3 rounded-full bg-foreground/40" />
        {[false, true, false].map((right, i) => (
          <div key={i} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${right ? 'border-success bg-success/10' : 'border-line'}`}>
            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[8px] ${right ? 'bf-pop border-success bg-success text-background' : 'border-line text-transparent'}`} style={right ? { animationDelay: '0.6s' } : undefined}>✓</span>
            <span className="h-1 w-16 rounded-full bg-foreground/25" />
          </div>
        ))}
      </div>
    </Stage>
  );
}

export function ThreadVisual() {
  return (
    <Stage>
      <div className="relative w-40 space-y-2 pl-4">
        <span className="absolute bottom-2 left-1.5 top-2 w-px bg-line" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative rounded-lg border border-line bg-panel p-2 shadow-sm">
            <span className="bf-pop absolute -left-[0.95rem] top-2.5 h-2.5 w-2.5 rounded-full bg-ember" style={{ animationDelay: `${i * 0.3}s` }} />
            <div className="h-1 w-full rounded-full bg-foreground/30" />
            <div className="mt-1 h-1 w-2/3 rounded-full bg-foreground/20" />
          </div>
        ))}
      </div>
    </Stage>
  );
}

export function ImageVisual() {
  return (
    <Stage>
      <div className="relative h-24 w-20 overflow-hidden rounded-lg border border-line bg-panel shadow-md">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 70% 25%, var(--ember), transparent 60%), #0b0b0b' }} />
        <div className="absolute inset-x-2 bottom-2 space-y-1"><div className="h-1.5 w-5/6 rounded-sm bg-white/90" /><div className="h-1.5 w-1/2 rounded-sm bg-ember" /></div>
      </div>
    </Stage>
  );
}

export function VideoVisual() {
  return (
    <Stage>
      <div className="relative flex h-24 w-14 items-center justify-center overflow-hidden rounded-lg border border-line bg-panel shadow-md">
        <div className="absolute inset-0 bg-gradient-to-b from-ember/30 to-transparent" />
        <span className="bf-pulse relative flex h-7 w-7 items-center justify-center rounded-full bg-background/80">
          <svg viewBox="0 0 20 20" className="h-3 w-3 translate-x-px fill-ember"><path d="M6 3.5v13l11-6.5z" /></svg>
        </span>
        <div className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-foreground/30"><div className="bf-grow h-full w-2/3 rounded-full bg-ember" /></div>
      </div>
    </Stage>
  );
}

export function DocumentVisual() {
  return (
    <Stage>
      <div className="h-24 w-[4.5rem] space-y-1.5 rounded-md border border-line bg-panel p-2 shadow-md">
        <div className="h-2 w-2/3 rounded-sm bg-ember" />
        {['w-full', 'w-11/12', 'w-full', 'w-3/4', 'w-full', 'w-1/2'].map((w, i) => <div key={i} className={`h-1 rounded-full bg-foreground/25 ${w}`} />)}
      </div>
    </Stage>
  );
}

export function OfferVisual() {
  return (
    <Stage>
      <div className="relative flex h-16 w-36 items-center justify-between rounded-xl border border-dashed border-ember bg-panel px-3 shadow-md">
        <div className="space-y-1.5"><div className="h-1.5 w-14 rounded-full bg-foreground/40" /><div className="h-1 w-10 rounded-full bg-foreground/20" /></div>
        <span className="font-serif text-2xl text-ember">%</span>
      </div>
    </Stage>
  );
}
