'use client';

import { useEffect, useRef, useState } from 'react';
import { loadFonts, slideCount } from '@/components/carousel/carousel-shared';
import type { PlannedPost } from '@/lib/distribute-plan.js';
import { drawPost, visualOf, type PostBrand } from '@/components/distribute/render-post';

// The picture for one planned post, drawn as soon as the fonts are ready. A carousel is a small swipe: arrows and dots
// step through its slides. What shows here is exactly what Download gives.
export function PostVisual({ post, brand }: { post: PlannedPost; brand: PostBrand }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [slide, setSlide] = useState(0);
  const visual = visualOf(post);
  const total = visual.type === 'carousel' ? slideCount(visual.plan) : 1;

  useEffect(() => {
    let live = true;
    void loadFonts().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !canvasRef.current) return;
    drawPost(canvasRef.current, post, brand, slide);
  }, [ready, post, brand, slide]);

  const label = visual.type === 'carousel' ? `Carousel, slide ${slide + 1} of ${total}` : `${post.format} picture`;
  return (
    <div className="w-full sm:w-40 sm:shrink-0">
      <div className="overflow-hidden rounded-xl border border-line bg-background">
        <canvas ref={canvasRef} className="mx-auto block h-auto max-h-64 w-auto max-w-full sm:max-h-52" aria-label={label} />
      </div>
      {total > 1 ? (
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
