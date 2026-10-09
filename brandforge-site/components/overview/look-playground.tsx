'use client';

import { useState } from 'react';
import { THEME_LIST } from '@/lib/carousel-render.js';

type Look = { id: string; label: string; accent: string; bg: string; light: boolean };

// Tap a look and the sample slide repaints. It is the same eight looks the carousel maker offers.
export function LookPlayground() {
  const looks = THEME_LIST as Look[];
  const [id, setId] = useState('forge');
  const look = looks.find((l) => l.id === id) ?? looks[0];
  const ink = look.light ? '#14110e' : '#ffffff';
  const soft = look.light ? 'rgba(20,17,14,0.35)' : 'rgba(255,255,255,0.4)';
  return (
    <div className="mx-auto mt-10 grid max-w-3xl items-center gap-8 sm:grid-cols-2">
      <div className="mx-auto w-56 sm:w-64">
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-line shadow-xl transition-colors duration-300" style={{ background: look.bg }} role="img" aria-label={`A sample cover in the ${look.label} look`}>
          <div className="absolute inset-0 transition-all duration-300" style={{ background: `radial-gradient(circle at 72% 24%, ${look.accent}, transparent 55%)`, opacity: look.light ? 0.5 : 0.85 }} />
          <div className="absolute inset-x-5 bottom-8">
            <p className="font-serif text-3xl leading-[1.02] transition-colors duration-300" style={{ color: ink }}>
              CALM TEAMS SHIP <span style={{ color: look.accent }}>MORE</span>
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: look.accent }}>5 habits worth stealing</p>
            <div className="mt-4 h-1 w-1/3 rounded-full" style={{ background: soft }} />
          </div>
        </div>
      </div>
      <div>
        <div role="radiogroup" aria-label="Look" className="flex flex-wrap gap-2.5">
          {looks.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={l.id === id}
              aria-label={l.label}
              title={l.label}
              onClick={() => setId(l.id)}
              className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition hover:scale-105 ${l.id === id ? 'border-ember' : 'border-line'}`}
            >
              <span className="block h-9 w-9 rounded-full border border-black/30" style={{ background: `linear-gradient(135deg, ${l.bg} 45%, ${l.accent} 46%)` }} />
            </button>
          ))}
        </div>
        <p className="mt-4 font-serif text-xl text-foreground">{look.label}</p>
        <p className="mt-1 text-sm text-muted">Eight looks for your slides, each in your own accent colour if you like. The app has three of its own: Forge, Crystal and black and white.</p>
      </div>
    </div>
  );
}
