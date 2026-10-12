'use client';

import { useEffect, useRef, useState } from 'react';
import { loadFonts, slideCount } from '@/components/carousel/carousel-shared';
import type { PlannedPost } from '@/lib/distribute-plan.js';
import { drawPost, visualOf, type PostBrand } from '@/components/distribute/render-post';

// The picture for one planned post, drawn as soon as the fonts are ready. A `tile` is the small one in the calendar (a
// carousel shows its cover); `full` is the one in the detail panel, where a carousel steps through its slides with arrows
// and dots. What shows here is exactly what Download gives.
export function PostVisual({ post, brand, size = 'full' }: { post: PlannedPost; brand: PostBrand; size?: 'tile' | 'full' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [slide, setSlide] = useState(0);
  const visual = visualOf(post);
  const total = visual.type === 'carousel' ? slideCount(visual.plan) : 1;
  const tile = size === 'tile';

  useEffect(() => {
    let live = true;
    void loadFonts().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !canvasRef.current) return;
    drawPost(canvasRef.current, post, brand, tile ? 0 : slide);
  }, [ready, post, brand, slide, tile]);

  const label = visual.type === 'carousel' ? `Carousel${tile ? ' cover' : `, slide ${slide + 1} of ${total}`}` : `${post.format} picture`;
  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-lg border border-line bg-background">
        <canvas ref={canvasRef} className={`mx-auto block h-auto w-auto max-w-full ${tile ? 'max-h-32' : 'max-h-80'}`} aria-label={label} />
      </div>
      {!tile && total > 1 ? (
        <div className="mt-1.5 flex items-center justify-between gap-1">
          <button type="button" onClick={() => setSlide((i) => Math.max(0, i - 1))} disabled={slide === 0} aria-label="Previous slide" className="rounded-md border border-line px-2 py-0.5 text-xs text-foreground disabled:opacity-40">←</button>
          <span className="flex flex-wrap justify-center gap-1" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-4 bg-ember' : 'w-1.5 bg-line'}`} />
            ))}
          </span>
          <button type="button" onClick={() => setSlide((i) => Math.min(total - 1, i + 1))} disabled={slide >= total - 1} aria-label="Next slide" className="rounded-md border border-line px-2 py-0.5 text-xs text-foreground disabled:opacity-40">→</button>
        </div>
      ) : null}
    </div>
  );
}
