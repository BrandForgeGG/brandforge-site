'use client';

import { useEffect, useRef, useState } from 'react';

// The hero's picture of what BrandForge does: one project moving from an idea to shipped work. Every stage is something
// the product really does (a chat with the team, a task the team accepts with the funds held, people working by role with
// AI helping, approval in the chat, release on approval). It is an illustration: roles, not invented people or clients.
const STAGES = ['Idea', 'Plan', 'Build', 'Review', 'Shipped'] as const;
const STEP_MS = 3200;

function Check({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

function Lane({ role, work, value, ai }: { role: string; work: string; value: number; ai?: string }) {
  return (
    <div className="rounded-xl border border-line bg-background/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-foreground">{role}</span>
        <span className="tabular-nums text-foreground/70">{value}%</span>
      </div>
      <p className="mt-0.5 truncate text-sm text-foreground">{work}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-overlay">
        <div className="bf-engine-progress h-full rounded-full bg-ember" style={{ width: `${value}%` }} />
      </div>
      {ai ? <p className="mt-1.5 text-[11px] text-foreground/70"><span className="rounded bg-overlay px-1 py-0.5 font-semibold text-foreground">AI</span> {ai}</p> : null}
    </div>
  );
}

function StageBody({ stage }: { stage: number }) {
  if (stage === 0) {
    return (
      <div className="space-y-3">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ember/12 px-4 py-3 text-sm leading-relaxed text-foreground" style={{ background: 'color-mix(in srgb, var(--ember) 12%, transparent)' }}>
          We launch our skincare brand next month. We need a logo, a landing page and launch posts.
        </div>
        <p className="flex items-center gap-2 text-xs text-foreground/70">
          <span className="h-1.5 w-1.5 rounded-full bg-trust" aria-hidden="true" />
          The whole team was notified.
        </p>
        <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-background/60 px-4 py-3 text-sm leading-relaxed text-foreground">
          <p className="text-[11px] font-semibold text-foreground/60">BrandForge team</p>
          <p className="mt-0.5">On it. A designer, a developer and a marketer can take this. Here is a plan and a price for you to agree.</p>
        </div>
      </div>
    );
  }
  if (stage === 1) {
    return (
      <div className="rounded-2xl border border-line bg-background/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Task</p>
          <span className="rounded-full bg-trust/15 px-2 py-0.5 text-[11px] font-semibold text-success">Accepted</span>
        </div>
        <p className="mt-2 font-serif text-xl text-foreground">Brand launch</p>
        <ul className="mt-2 space-y-1.5 text-sm text-foreground">
          {['Logo and brand kit', 'Landing page', 'Six launch posts'].map((item) => (
            <li key={item} className="flex items-center gap-2"><span className="text-ember"><Check /></span>{item}</li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="font-serif text-2xl text-foreground">€900</span>
          <span className="text-xs text-foreground/70">Funds held by BrandForge</span>
        </div>
      </div>
    );
  }
  if (stage === 2) {
    return (
      <div className="space-y-2">
        <Lane role="Designer" work="Logo and brand kit" value={82} />
        <Lane role="Developer" work="Landing page" value={56} />
        <Lane role="Marketer" work="Six launch posts" value={38} ai="drafts the captions, the marketer edits" />
      </div>
    );
  }
  if (stage === 3) {
    return (
      <div className="rounded-2xl border border-line bg-background/60 p-3">
        {/* A drawn stand-in for the delivered page: shapes, not a real client's site. */}
        <div className="overflow-hidden rounded-xl border border-line bg-panel" aria-hidden="true">
          <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
          </div>
          <div className="grid grid-cols-[1.2fr_1fr] gap-3 p-3">
            <div className="space-y-1.5">
              <span className="block h-2.5 w-16 rounded bg-ember/70" />
              <span className="block h-3.5 w-full rounded bg-foreground/80" />
              <span className="block h-3.5 w-4/5 rounded bg-foreground/80" />
              <span className="block h-2 w-3/5 rounded bg-foreground/25" />
              <span className="mt-2 block h-5 w-20 rounded-md bg-ember" />
            </div>
            <div className="rounded-lg" style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--ember) 35%, var(--panel)), var(--panel-2))' }} />
          </div>
        </div>
        <p className="mt-3 text-sm text-foreground">Landing page is ready for your review.</p>
        <div className="mt-2 flex gap-2">
          <span className="flex-1 rounded-lg bg-ember px-3 py-2 text-center text-xs font-semibold text-on-ember">Approve</span>
          <span className="flex-1 rounded-lg border border-line px-3 py-2 text-center text-xs font-semibold text-foreground">Ask for changes</span>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-background/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-success">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-trust/15"><Check /></span>
        Shipped and approved
      </p>
      <ul className="mt-3 space-y-2 text-sm text-foreground">
        {['Logo and brand kit', 'Landing page, live', 'Six launch posts, scheduled'].map((item) => (
          <li key={item} className="flex items-center justify-between gap-2 border-b border-line pb-2 last:border-b-0 last:pb-0">
            <span>{item}</span>
            <span className="text-success"><Check /></span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-foreground/70">Funds released to the team after your approval.</p>
    </div>
  );
}

export function ExecutionEngine() {
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (paused || reduced.current) return;
    const timer = window.setTimeout(() => setStage((current) => (current + 1) % STAGES.length), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [stage, paused]);

  return (
    <figure
      className="relative mx-auto w-full max-w-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="overflow-hidden rounded-3xl border border-line bg-panel shadow-[0_40px_90px_-50px_rgba(29,27,24,0.45)]">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="truncate text-sm font-semibold text-foreground">Brand launch</p>
          <span className="flex items-center gap-1.5 text-xs text-foreground/70">
            <span className="h-1.5 w-1.5 rounded-full bg-ember" aria-hidden="true" />
            {STAGES[stage]}
          </span>
        </div>
        {/* The stages, as real buttons: click one to see it. */}
        <div role="tablist" aria-label="Project stages" className="grid grid-cols-5 gap-1 px-3 pt-3">
          {STAGES.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={index === stage}
              onClick={() => setStage(index)}
              className="group flex flex-col gap-1.5 rounded-md px-0.5 pb-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
            >
              <span className="h-1 overflow-hidden rounded-full bg-overlay">
                <span className="bf-engine-progress block h-full rounded-full bg-ember" style={{ width: index <= stage ? '100%' : '0%' }} />
              </span>
              <span className={`truncate text-[11px] font-semibold ${index === stage ? 'text-foreground' : 'text-foreground/55 group-hover:text-foreground'}`}>{label}</span>
            </button>
          ))}
        </div>
        <div className="min-h-[17.5rem] p-4" role="tabpanel" aria-live="polite">
          <div key={stage} className="bf-stage-in">
            <StageBody stage={stage} />
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-foreground/60">Illustration: one project moving through BrandForge.</figcaption>
    </figure>
  );
}
