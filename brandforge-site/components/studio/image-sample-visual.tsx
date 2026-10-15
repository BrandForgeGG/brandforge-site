import { THEMES } from '@/lib/carousel-render.js';
import type { ImageKind } from '@/lib/image-kinds.js';

// The thumbnail on a Create card: a small template of the kind of picture it makes, in plain HTML so the page shows it
// at once (no drawing, no font or picture loading). The words are examples, not results.
type Theme = { bg: string; text: string; accent: string; muted: string; light: boolean };
type Sample = { shape: 'portrait' | 'square' | 'story' | 'pin'; theme: string; kicker?: string; head: [string, string, string?]; sub?: string; button?: string; options?: string[] };

const SAMPLES: Record<ImageKind, Sample> = {
  ad: { shape: 'portrait', theme: 'forge', kicker: 'New', head: ['Your ', 'idea', ', made today'], sub: 'Say it once.', button: 'Try it free' },
  quote: { shape: 'square', theme: 'violet', head: ['“Done is better than ', 'perfect', '”'] },
  tip: { shape: 'square', theme: 'paper', kicker: 'Quick tip', head: ['Write the ', 'hook', ' first'], sub: 'The first line decides.' },
  announcement: { shape: 'square', theme: 'sunrise', kicker: 'New', head: ['We just ', 'launched'], button: 'See it' },
  question: { shape: 'square', theme: 'emerald', kicker: 'Poll', head: ['Morning or ', 'evening', '?'], options: ['Morning', 'Evening'] },
  cover: { shape: 'story', theme: 'rose', kicker: 'New episode', head: ['The ', 'one', ' thing'] },
  infographic: { shape: 'portrait', theme: 'paper', kicker: 'How to', head: ['A post in ', '3 steps'], options: ['Hook', 'One idea', 'One action'] },
  offer: { shape: 'portrait', theme: 'sunrise', kicker: 'Offer', head: ['First month ', 'on us'], button: 'Claim it' },
  event: { shape: 'square', theme: 'violet', kicker: 'Event', head: ['Live: build in ', 'public'], button: 'Save your seat' },
  pin: { shape: 'pin', theme: 'crystal', kicker: 'Guide', head: ['A week of posts in ', 'one hour'], button: 'Read it' },
};

const SIZE: Record<Sample['shape'], string> = { portrait: 'h-[86%] aspect-[4/5]', square: 'h-[80%] aspect-square', story: 'h-[90%] aspect-[9/16]', pin: 'h-[90%] aspect-[2/3]' };

export function ImageSampleVisual({ kind }: { kind: ImageKind }) {
  const s = SAMPLES[kind];
  const t = ((THEMES as Record<string, Theme>)[s.theme] ?? (THEMES as Record<string, Theme>).forge) as Theme;
  return (
    <div aria-hidden="true" className="relative flex aspect-[5/3] items-center justify-center overflow-hidden rounded-xl border border-line bg-background">
      <div className={`relative flex flex-col justify-center gap-1 overflow-hidden rounded-md p-2 shadow-md ${SIZE[s.shape]}`} style={{ background: t.bg, color: t.text }}>
        <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-40 blur-xl" style={{ background: t.accent }} />
        {s.kicker ? <span className="relative text-[7px] font-bold uppercase tracking-[0.12em]" style={{ color: t.accent }}>{s.kicker}</span> : null}
        <span className="relative text-[11px] font-bold leading-[1.1]">
          {s.head[0]}
          <span style={{ color: t.accent }}>{s.head[1]}</span>
          {s.head[2] ?? ''}
        </span>
        {s.sub ? <span className="relative text-[7px] leading-tight" style={{ color: t.muted }}>{s.sub}</span> : null}
        {s.options ? (
          <span className="relative mt-0.5 flex flex-col gap-0.5">
            {s.options.map((option) => (
              <span key={option} className="rounded-sm px-1 py-px text-[7px]" style={{ border: `1px solid ${t.muted}55` }}>{option}</span>
            ))}
          </span>
        ) : null}
        {s.button ? <span className="relative mt-0.5 self-start rounded-sm px-1.5 py-0.5 text-[7px] font-bold" style={{ background: t.accent, color: t.light ? '#ffffff' : t.bg }}>{s.button}</span> : null}
      </div>
    </div>
  );
}
