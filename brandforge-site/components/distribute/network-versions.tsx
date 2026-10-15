'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadFonts } from '@/components/carousel/carousel-shared';
import { drawPost, isSinglePicture, type PostBrand } from '@/components/distribute/render-post';
import { networkOf, versionsFor, type PictureShape } from '@/lib/network-formats.js';
import type { PlannedPost } from '@/lib/distribute-plan.js';

// "One post, every format": what each network will actually get from this post, before anything is sent. A single
// picture is drawn at each network's shape and every caption is fitted to its network; networks that end up identical
// share one card. With no channels linked yet, it previews four common networks so the idea is clear from the start.

type Channel = { id: string; kind: string; label: string };

const PREVIEW: Channel[] = [
  { id: 'preview-instagram', kind: 'instagram', label: 'Instagram' },
  { id: 'preview-x', kind: 'x', label: 'X' },
  { id: 'preview-linkedin', kind: 'linkedin', label: 'LinkedIn' },
  { id: 'preview-bluesky', kind: 'bluesky', label: 'Bluesky' },
];

const RATIO: Record<PictureShape, string> = { portrait: '4 / 5', wide: '16 / 9', square: '1 / 1' };

function ShapeCanvas({ post, brand, shape }: { post: PlannedPost; brand: PostBrand; shape: PictureShape | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    void loadFonts().then(() => {
      if (live && ref.current) drawPost(ref.current, post, brand, 0, shape);
    });
    return () => {
      live = false;
    };
  }, [post, brand, shape]);
  return <canvas ref={ref} className="w-full rounded-lg border border-line bg-overlay" style={{ aspectRatio: shape ? RATIO[shape] : '4 / 5' }} aria-label={`Picture as it goes out${shape ? ` (${shape})` : ''}`} />;
}

export function NetworkVersions({ post, brand, channels, picked }: { post: PlannedPost; brand: PostBrand; channels: Channel[]; picked: string[] }) {
  const [open, setOpen] = useState(false);
  const chosen = channels.filter((c) => picked.includes(c.id));
  const list = chosen.length > 0 ? chosen : PREVIEW;
  const single = isSinglePicture(post);
  const versions = useMemo(() => {
    const kinds = Object.fromEntries(list.map((c) => [c.id, c.kind]));
    return versionsFor(list.map((c) => c.id), kinds, post.caption, single);
  }, [list, post.caption, single]);
  const name = (id: string) => list.find((c) => c.id === id)?.label ?? 'a network';

  return (
    <details className="mt-3 rounded-xl border border-line" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm text-foreground">
        <span>
          <span className="font-medium">Each network gets its own version</span>
          <span className="ml-1.5 text-xs text-muted">
            {versions.length} {versions.length === 1 ? 'version' : 'versions'}
            {chosen.length === 0 ? ' · preview' : ''}
          </span>
        </span>
        <span className="text-muted" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </summary>
      {open ? (
        <div className="border-t border-line p-3">
          <p className="text-xs text-muted">
            {single ? 'The picture is redrawn at the shape each network shows best, and ' : 'Carousels keep their slides; '}
            each caption is fitted to its network: length, hashtags, and the call to action kept.
          </p>
          <div className="mt-3 space-y-2.5">
            {versions.map((version) => {
              const shape = version.shape === 'native' ? undefined : (version.shape as PictureShape);
              const kinds = version.channelIds.map((id) => list.find((c) => c.id === id)?.kind ?? '');
              const limit = Math.min(...kinds.map((k) => networkOf(k).limit));
              const used = [...version.caption].length;
              return (
                <div key={version.channelIds.join(',')} className="flex gap-3 rounded-xl border border-line bg-background p-2.5">
                  <div className={`shrink-0 ${shape === 'wide' ? 'w-36' : shape === 'square' ? 'w-24' : 'w-20'}`}>
                    <ShapeCanvas post={post} brand={brand} shape={shape} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground">{version.channelIds.map(name).join(', ')}</span>
                      {shape ? <span className="rounded-full bg-overlay px-1.5 py-0.5 text-[10px] font-medium text-muted">{networkOf(kinds[0]).ratio}</span> : null}
                      <span className={`ml-auto text-[10px] tabular-nums ${used > limit ? 'text-danger' : 'text-muted'}`}>{used} / {limit}</span>
                    </div>
                    <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">{version.caption}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </details>
  );
}
