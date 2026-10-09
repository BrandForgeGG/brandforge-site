'use client';

import { useRouter } from 'next/navigation';
import { CarouselMaker } from '@/components/carousel/carousel-maker';
import { FormatCatalog } from '@/components/carousel/format-catalog';

// The Create page: the carousel maker, then the formats we are making. Live ones show by default; "Show
// everything" lists the rest with their real status. Posting formats open on Distribute.
export function CreateHub() {
  const router = useRouter();
  return (
    <div className="space-y-12">
      <CarouselMaker />
      <FormatCatalog
        title="What you can make and post"
        groups={['carousels', 'short', 'long', 'pins', 'articles']}
        onPick={(format) => {
          if (format.tool?.kind === 'carousel') window.scrollTo({ top: 0, behavior: 'smooth' });
          else router.push(`/distribute?format=${format.n}`);
        }}
      />
    </div>
  );
}
