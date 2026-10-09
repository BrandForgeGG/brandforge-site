'use client';

import { useRouter } from 'next/navigation';
import { CarouselMaker } from '@/components/carousel/carousel-maker';
import { FormatCatalog } from '@/components/carousel/format-catalog';

// The Create page: the carousel maker, then every format, the same list as Distribute. Live ones open; the rest show their real status. Posting
// formats open on Distribute.
export function CreateHub() {
  const router = useRouter();
  return (
    <div className="space-y-12">
      <CarouselMaker />
      <FormatCatalog
        title="All formats"
        onPick={(format) => {
          if (format.tool?.kind === 'carousel') window.scrollTo({ top: 0, behavior: 'smooth' });
          else router.push(`/distribute?format=${format.n}`);
        }}
      />
    </div>
  );
}
