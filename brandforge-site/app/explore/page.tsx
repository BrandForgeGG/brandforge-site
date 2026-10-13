import type { Metadata } from 'next';
import { pageGraph, pageMeta } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';
import { AppShell } from '@/components/app-shell';
import { ExploreHub } from '@/components/explore/explore-hub';

export const metadata: Metadata = pageMeta({ path: '/explore', title: 'Explore: where BrandForge is going', description: 'Where BrandForge is going, what members are doing right now, and what is live, being built and needed next.' });

export default function ExplorePage() {
  return (
    <>
      <JsonLd data={pageGraph({ path: '/explore', name: 'Explore', kind: 'CollectionPage', crumbs: [{ name: 'Explore', path: '/explore' }] })} />
      <AppShell title="Explore" subtitle="Where we are going, and what is happening now." wide>
        <ExploreHub />
      </AppShell>
    </>
  );
}
