'use client';

import { useEffect, useRef, useState } from 'react';
import { TaskCardView, WORK_STAGES, type TaskView } from '@/components/work/task-card-view';

// The hero's picture of BrandForge: a chat with one task moving from request to delivery. It draws the very card people
// get in their chat (components/work/task-card-view, in demo mode), so the homepage and the product can never differ.
// It is an illustration: roles, not invented people or clients.
const STEP_MS = 3400;
const TITLE = 'Brand launch: logo, landing page, launch posts';

const MOMENTS: { task: TaskView; line?: string }[] = [
  { task: { status: 'open', amount: 900 } },
  { task: { status: 'accepted', amount: 900 }, line: 'The designer accepted it at €900.' },
  { task: { status: 'funded', amount: 900 }, line: 'Paid. Funds held by BrandForge.' },
  { task: { status: 'funded', amount: 900 }, line: 'Designer, developer and marketer are on it. AI drafts the post captions.' },
  { task: { status: 'review', amount: 900, reviewNote: 'Logo, landing page and six posts are ready.' }, line: 'Sent for your review.' },
  { task: { status: 'delivered', amount: 900 }, line: 'Approved. Funds released to the team.' },
];

export function ExecutionEngine() {
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (paused || reduced.current) return;
    const timer = window.setTimeout(() => setStage((current) => (current + 1) % MOMENTS.length), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [stage, paused]);

  const moment = MOMENTS[stage];
  return (
    <figure
      className="relative mx-auto w-full max-w-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="overflow-hidden rounded-3xl border border-line bg-background shadow-[0_40px_90px_-50px_rgba(29,27,24,0.45)]">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3">
          <p className="truncate text-sm font-semibold text-foreground">Brand launch</p>
          <span className="flex items-center gap-1.5 text-xs text-foreground/70">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            Team online
          </span>
        </div>
        <div className="space-y-3 p-4" aria-live="polite">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed text-foreground" style={{ background: 'color-mix(in srgb, var(--ember) 12%, transparent)' }}>
            We launch next month. We need a logo, a landing page and launch posts.
          </div>
          <div key={stage} className="bf-stage-in space-y-3">
            <TaskCardView title={TITLE} task={moment.task} role="buyer" demo stage={stage} onStage={setStage} />
            {moment.line ? <p className="text-center text-xs text-foreground/70">{moment.line}</p> : null}
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-foreground/60">
        Illustration: the task card you get in your chat, from {WORK_STAGES[0].toLowerCase()} to {WORK_STAGES[WORK_STAGES.length - 1].toLowerCase()}.
      </figcaption>
    </figure>
  );
}
