'use client';

import { useEffect, useState } from 'react';
import type { LaunchScene } from '@/lib/launch-video.js';
import type { LaunchLook } from '@/components/video/launch-engine';

type StepState = 'pending' | 'active' | 'done' | 'failed';
type Step = { id: string; label: string; detail?: string; state: StepState };

// The wait while a launch video comes together, shown as what is really happening: reading the site, writing the story,
// gathering its pictures, photographing it, recording the voice. A small stage in the site's own colours comes alive as
// each part lands: the palette appears, then the scenes' words play through.
export function LaunchProgress({
  look,
  host,
  scenes,
  writing,
  writeStarted,
  picturesState,
  shotState,
  withVoice,
  voiceState,
  tall,
}: {
  look: LaunchLook;
  host: string;
  scenes: LaunchScene[];
  writing: boolean;
  writeStarted: number | null;
  picturesState: 'idle' | 'loading' | 'done';
  shotState: 'idle' | 'loading' | 'done' | 'none';
  withVoice: boolean;
  voiceState: { status: 'idle' | 'working' | 'ready' | 'failed'; text: string };
  tall: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      setBeat((value) => value + 1);
    }, 2200);
    return () => window.clearInterval(timer);
  }, []);

  const written = scenes.length > 0;
  const elapsed = writing && writeStarted ? (now - writeStarted) / 1000 : 0;
  const voiceCount = /(\d+) of (\d+)/.exec(voiceState.text);
  const steps: Step[] = [
    { id: 'read', label: host ? `Reading ${host}` : 'Reading your idea', state: written || (writing && elapsed >= 4) ? 'done' : writing ? 'active' : 'pending' },
    { id: 'story', label: 'Writing your story', detail: written ? `${scenes.length} scenes` : undefined, state: written ? 'done' : writing && elapsed >= 4 ? 'active' : 'pending' },
    ...(host
      ? [
          { id: 'pictures', label: 'Gathering your pictures', state: (picturesState === 'done' ? 'done' : picturesState === 'loading' ? 'active' : 'pending') as StepState },
          {
            id: 'shot',
            label: shotState === 'none' ? 'Your pictures will stand in for the site' : 'Photographing your site',
            detail: shotState === 'loading' ? 'This one can take a little longer; nothing waits for it' : undefined,
            state: (shotState === 'done' || shotState === 'none' ? 'done' : shotState === 'loading' ? 'active' : 'pending') as StepState,
          },
        ]
      : []),
    ...(withVoice
      ? [
          {
            id: 'voice',
            label: 'Recording the voice-over',
            detail: voiceState.status === 'failed' ? voiceState.text : voiceCount ? `${voiceCount[1]} of ${voiceCount[2]} scenes` : undefined,
            state: (voiceState.status === 'ready' ? 'done' : voiceState.status === 'failed' ? 'failed' : voiceState.status === 'working' ? 'active' : 'pending') as StepState,
          },
        ]
      : []),
  ];
  const done = steps.filter((step) => step.state === 'done').length;
  const share = Math.max(0.06, done / steps.length);
  const words = written ? scenes[beat % scenes.length] : null;

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-panel" role="status" aria-live="polite">
      <div className="grid gap-0 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* The stage: the site's colours coming alive. */}
        <div className="relative flex items-center justify-center overflow-hidden p-4" style={{ background: look.bg }}>
          <div className={`relative overflow-hidden rounded-2xl ${tall ? 'mx-auto aspect-[9/16] h-[52vh] max-h-[460px]' : 'aspect-video w-full'}`} style={{ background: look.bg }}>
            <div aria-hidden="true" className="bf-drift absolute -left-1/4 -top-1/3 h-[140%] w-[90%] rounded-full opacity-60 blur-3xl" style={{ background: `radial-gradient(circle, ${look.accent}55, transparent 65%)` }} />
            <div aria-hidden="true" className="bf-sweep absolute inset-0" style={{ background: `linear-gradient(100deg, transparent 30%, ${look.text}14 50%, transparent 70%)` }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              {words ? (
                <p key={beat} className="bf-rise max-w-[90%] font-serif text-xl leading-tight sm:text-3xl" style={{ color: look.text }}>
                  {words.heading}
                </p>
              ) : (
                <p className="font-serif text-xl sm:text-3xl" style={{ color: look.text }}>
                  {host || 'Your launch'}
                  <span className="bf-dots ml-1" style={{ color: look.accent }} aria-hidden="true">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </p>
              )}
            </div>
            {written ? (
              <div className="bf-rise absolute bottom-3 left-3 flex items-center gap-1.5" aria-label="Colours from your site">
                {[look.bg, look.text, look.accent].map((color, i) => (
                  <span key={i} className="h-4 w-4 rounded-full border border-white/30 shadow" style={{ background: color }} />
                ))}
              </div>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: `${look.text}22` }}>
              <div className="h-full transition-[width] duration-700 ease-out" style={{ width: `${share * 100}%`, background: look.accent }} />
            </div>
          </div>
        </div>

        {/* What is happening, one line per real step. */}
        <ol className="space-y-3 p-5 sm:p-6">
          <li className="pb-1">
            <p className="font-serif text-lg text-foreground">{written ? 'Putting your video together' : 'Getting to know your launch'}</p>
            <p className="text-xs text-muted">{done} of {steps.length} done</p>
          </li>
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-3">
              <StepMark state={step.state} />
              <div className="min-w-0">
                <p className={`text-sm ${step.state === 'pending' ? 'text-muted' : 'text-foreground'}`}>{step.label}</p>
                {step.detail ? <p className={`text-xs ${step.state === 'failed' ? 'text-danger' : 'text-muted'}`}>{step.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function StepMark({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="bf-pop mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-trust/15 text-success" aria-label="Done">
        <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 10.5l3.2 3L15 6.5" />
        </svg>
      </span>
    );
  }
  if (state === 'active') {
    return <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-ember/25 border-t-ember" aria-label="Working" />;
  }
  if (state === 'failed') {
    return <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger/10 text-[11px] font-bold text-danger" aria-label="Did not work">!</span>;
  }
  return <span className="mt-1.5 ml-1.5 h-2 w-2 shrink-0 rounded-full bg-line" aria-label="Waiting" />;
}
