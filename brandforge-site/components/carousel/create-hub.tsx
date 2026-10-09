'use client';

import { useRouter } from 'next/navigation';
import { CarouselMaker } from '@/components/carousel/carousel-maker';
import { FormatCatalog } from '@/components/carousel/format-catalog';
import { CREATIONS, GROUPS } from '@/lib/creation-catalog.js';

// The Create page: the carousel maker, then everything you can make. This list is about the thing itself
// (a carousel, a poll, a video), never a platform; where it can be posted is the Distribute page.
export function CreateHub() {
  const router = useRouter();
  return (
    <div className="space-y-12">
      <CarouselMaker />
      <FormatCatalog
        title="What you can make"
        formats={CREATIONS}
        groupList={GROUPS}
        onPick={(creation) => {
          if (creation.tool?.kind === 'carousel') window.scrollTo({ top: 0, behavior: 'smooth' });
          else if (creation.tool?.kind === 'post') router.push(`/distribute?make=${creation.tool.type}`);
        }}
      />
    </div>
  );
}
