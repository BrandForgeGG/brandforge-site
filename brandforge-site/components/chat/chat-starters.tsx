import Link from 'next/link';

// The first screen of a new chat, for someone who came to get work done: one tap writes the first line for them (they
// finish it and send), with the four areas the team works in. The do-it-yourself tools stay one quiet line away.
const STARTERS: { area: string; hue: string; text: string }[] = [
  { area: 'Development', hue: 'var(--hue-trade)', text: 'I need a website, app or AI chatbot built. Here is what it should do: ' },
  { area: 'Design', hue: 'var(--hue-create)', text: 'I need design work: brand identity, posts or ad creatives. My brand is ' },
  { area: 'Video', hue: 'var(--hue-explore)', text: 'I need videos: Reels, TikToks or a launch video. My brand is ' },
  { area: 'Marketing', hue: 'var(--hue-distribute)', text: 'I need marketing: ads, SEO or emails. My goal is ' },
];

const LABEL: Record<string, string> = {
  Development: 'Build a site, app or AI chatbot',
  Design: 'Design my brand, posts or ads',
  Video: 'Make my Reels, TikToks or launch video',
  Marketing: 'Run my ads, SEO or emails',
};

export function ChatStarters({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mt-7 w-full">
      <div className="grid w-full gap-2 text-left sm:grid-cols-2">
        {STARTERS.map((item) => (
          <button key={item.area} type="button" onClick={() => onPick(item.text)} className="group rounded-2xl border border-line bg-panel p-4 text-left transition hover:border-ember">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: item.hue }}>
              <span className="h-2 w-2 rounded-full" style={{ background: item.hue }} aria-hidden="true" />
              {item.area}
            </span>
            <span className="mt-1.5 block text-sm font-medium text-foreground">{LABEL[item.area]}</span>
          </button>
        ))}
      </div>
      <p className="mt-5 text-center text-xs text-muted">
        Team plans from €690/mo, 1 to 3 tasks at a time. <Link href="/pricing" className="font-semibold text-foreground underline-offset-2 hover:underline">See plans</Link>
      </p>
      <p className="mt-1.5 text-center text-xs text-muted">
        Rather do it yourself? <Link href="/create" className="underline-offset-2 hover:text-foreground hover:underline">Create</Link> · <Link href="/distribute" className="underline-offset-2 hover:text-foreground hover:underline">Distribute</Link> · <Link href="/trade" className="underline-offset-2 hover:text-foreground hover:underline">Trade</Link>
      </p>
    </div>
  );
}
