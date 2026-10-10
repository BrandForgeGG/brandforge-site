'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// A row you swipe. Cards snap into place, the arrows move one screen at a time, and the arrow keys work when the row
// has focus. Nothing is hidden: it is an ordinary scrolling list, so it also works with a mouse wheel or a trackpad.
export function SwipeRow({ label, children, itemClass }: { label: string; children: React.ReactNode[]; itemClass?: string }) {
  const row = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<{ start: boolean; end: boolean }>({ start: true, end: false });
  const [position, setPosition] = useState(1);
  const [thumb, setThumb] = useState<{ left: number; width: number }>({ left: 0, width: 100 });
  // A row always opens on its first card, even after a link to #feedback or while fonts and pictures settle, until
  // the person touches it.
  const touched = useRef(false);

  const update = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.offsetWidth + 16 : el.clientWidth;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    setPosition(Math.min(children.length, Math.round(el.scrollLeft / step) + 1));
    setThumb({ left: (el.scrollLeft / el.scrollWidth) * 100, width: Math.min(100, (el.clientWidth / el.scrollWidth) * 100) });
  }, [children.length]);

  useEffect(() => {
    const el = row.current;
    const toStart = () => {
      if (el && !touched.current && el.scrollLeft !== 0) el.scrollLeft = 0;
    };
    toStart();
    update();
    const timers = [150, 500, 1200, 2500].map((ms) => window.setTimeout(toStart, ms));
    const mark = () => {
      touched.current = true;
    };
    el?.addEventListener('pointerdown', mark, { passive: true });
    el?.addEventListener('wheel', mark, { passive: true });
    el?.addEventListener('keydown', mark);
    window.addEventListener('resize', update);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      el?.removeEventListener('pointerdown', mark);
      el?.removeEventListener('wheel', mark);
      el?.removeEventListener('keydown', mark);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  function move(direction: 1 | -1) {
    const el = row.current;
    if (!el) return;
    touched.current = true;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.85), behavior: calm ? 'auto' : 'smooth' });
  }

  const arrow = 'flex h-9 w-9 items-center justify-center rounded-full border border-line text-foreground transition hover:border-ember disabled:opacity-35';
  return (
    <div className="group">
      <div
        ref={row}
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={update}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            move(1);
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move(-1);
          }
        }}
        className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-6 px-6 pb-3 bf-noscrollbar focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ember"
      >
        {children.map((child, index) => (
          <div key={index} className={itemClass ?? 'flex w-[85%] shrink-0 snap-start sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.7rem)]'}>
            {child}
          </div>
        ))}
      </div>
      {/* Where you are in the row: hidden until the pointer or keyboard focus is on it. */}
      <div aria-hidden="true" className="pointer-events-none mx-auto h-0.5 w-full max-w-xs rounded-full bg-line opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
        <div className="h-full rounded-full bg-ember" style={{ marginLeft: `${thumb.left}%`, width: `${thumb.width}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-center gap-4">
        <button type="button" onClick={() => move(-1)} disabled={edge.start} aria-label={`Previous ${label}`} className={arrow}>
          <span aria-hidden="true">←</span>
        </button>
        <span className="min-w-12 text-center text-xs tabular-nums text-muted" aria-live="polite">
          {position} / {children.length}
        </span>
        <button type="button" onClick={() => move(1)} disabled={edge.end} aria-label={`Next ${label}`} className={arrow}>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
