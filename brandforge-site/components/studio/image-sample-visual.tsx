'use client';

import { useEffect, useRef } from 'react';
import { loadFonts } from '@/components/carousel/carousel-shared';
import { renderImage } from '@/components/image/image-shared';
import { sizeOf } from '@/lib/image-render.js';
import type { ImageCopy, ImageFormat, ImageKind } from '@/lib/image-kinds.js';

// The thumbnail on a Create card: the real drawing code run once on a sample, so the card shows exactly the kind
// of picture it makes. Nothing here claims a result; the words are examples.
const base: ImageCopy = { kicker: '', headline: '', sub: '', button: '', options: [], attribution: '', scene: '' };
const SAMPLES: Record<ImageKind, { format: ImageFormat; theme: string; copy: ImageCopy }> = {
  ad: { format: 'portrait', theme: 'forge', copy: { ...base, kicker: 'New', headline: 'Your *idea*, made today', sub: 'Say it once. Get the picture.', button: 'Try it free' } },
  quote: { format: 'square', theme: 'violet', copy: { ...base, headline: 'Done is better than *perfect*' } },
  tip: { format: 'square', theme: 'paper', copy: { ...base, kicker: 'Quick tip', headline: 'Write the *hook* first', sub: 'The first line decides who reads the rest.' } },
  announcement: { format: 'square', theme: 'sunrise', copy: { ...base, kicker: 'New', headline: 'We just *launched*', sub: 'Here is what changed.', button: 'See it' } },
  question: { format: 'square', theme: 'emerald', copy: { ...base, kicker: 'Poll', headline: 'Morning or *evening*?', options: ['Morning', 'Evening'] } },
  cover: { format: 'story', theme: 'rose', copy: { ...base, kicker: 'New episode', headline: 'The *one* thing nobody tells you', sub: 'Watch to the end.' } },
  infographic: { format: 'portrait', theme: 'paper', copy: { ...base, kicker: 'How to', headline: 'Write a post in *3 steps*', options: ['Start with the hook', 'Say one useful thing', 'Ask for one action'] } },
  offer: { format: 'portrait', theme: 'sunrise', copy: { ...base, kicker: 'Offer', headline: 'Your first month, *on us*', sub: 'Use the code at checkout.', button: 'Claim it' } },
  event: { format: 'square', theme: 'violet', copy: { ...base, kicker: 'Event', headline: 'Live: build in *public*', sub: 'Your date, time and place here.', button: 'Save your seat' } },
  pin: { format: 'pin', theme: 'crystal', copy: { ...base, kicker: 'Guide', headline: 'A week of posts in *one hour*', sub: 'The simple plan we use.', button: 'Read it' } },
};

export function ImageSampleVisual({ kind }: { kind: ImageKind }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sample = SAMPLES[kind];
  const { w, h } = sizeOf(sample.format);

  useEffect(() => {
    let live = true;
    void loadFonts().then(() => {
      if (live && canvasRef.current) renderImage(canvasRef.current, { kind, format: sample.format, copy: sample.copy }, sample.theme, { name: 'BrandForge', handle: '', accent: '' }, null, `s-${kind}`);
    });
    return () => {
      live = false;
    };
  }, [kind, sample]);

  return (
    <div aria-hidden="true" className="relative flex aspect-[5/3] items-center justify-center overflow-hidden rounded-xl border border-line bg-background">
      <canvas ref={canvasRef} width={w} height={h} className="h-[86%] w-auto rounded-md shadow-md" />
    </div>
  );
}
