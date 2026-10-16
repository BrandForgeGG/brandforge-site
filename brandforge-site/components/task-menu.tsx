import { TASK_EXAMPLES } from '@/lib/plans.js';

// Small line icons, one per area, drawn in the area's own colour.
const ICON: Record<string, React.ReactNode> = {
  Development: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  Design: <path d="M12 3a9 9 0 100 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0021 9.8C21 6 17 3 12 3zM7.5 12a1 1 0 110-2 1 1 0 010 2zm3-4a1 1 0 110-2 1 1 0 010 2zm5 0a1 1 0 110-2 1 1 0 010 2z" />,
  Video: <path d="M4 6h11a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zM16 10l5-3v10l-5-3" />,
  Marketing: <path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM15 9a4 4 0 010 6M18 6a8 8 0 010 12" />,
};

const HUE: Record<string, string> = {
  Development: 'var(--hue-trade)',
  Design: 'var(--hue-create)',
  Video: 'var(--hue-explore)',
  Marketing: 'var(--hue-distribute)',
};

// What a task can be: the four areas the team works in, each with the work buyers ask for most. Any of these is one task;
// the plan decides how many run at a time.
export function TaskMenu() {
  return (
    <section aria-labelledby="task-menu-title" className="mt-14">
      <h3 id="task-menu-title" className="text-center font-serif text-3xl text-foreground sm:text-4xl">What a task can be</h3>
      <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">Pick anything below, as many as you like. Your plan sets how many we work on at once.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TASK_EXAMPLES.map((group) => (
          <div key={group.area} className="flex flex-col rounded-3xl border border-line bg-panel p-5" style={{ boxShadow: `inset 0 3px 0 ${HUE[group.area] ?? 'var(--ember)'}` }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-overlay" style={{ color: HUE[group.area] ?? 'var(--ember)' }} aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {ICON[group.area]}
              </svg>
            </span>
            <p className="mt-4 font-serif text-2xl text-foreground">{group.area}</p>
            <p className="mt-1 text-sm text-muted">{group.line}</p>
            <ul className="mt-4 space-y-2 border-t border-line pt-4">
              {group.examples.map((example) => (
                <li key={example} className="flex gap-2 text-sm leading-snug text-foreground">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: HUE[group.area] ?? 'var(--ember)' }} aria-hidden="true" />
                  {example}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
