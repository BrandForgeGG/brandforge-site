import type { Metadata } from 'next';
import { pageGraph, pageMeta, toolLd } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';
import { AppShell } from '@/components/app-shell';
import { StudioHub } from '@/components/studio/studio-hub';

export const metadata: Metadata = pageMeta({ path: "/create", title: "Create — BrandForge", description: "Make a carousel, an ad, a quote, a tip, an announcement or a poll from one sentence, then download it. Free to make; sign in to download." });

export default function CreatePage() {
  return (
    <>
      <JsonLd data={pageGraph({ path: '/create', name: 'Create', kind: 'WebPage', crumbs: [{ name: 'Create', path: '/create' }], extra: [toolLd({ path: '/create', name: 'BrandForge Create', category: 'DesignApplication', features: ['Carousels', 'Ads', 'Quotes', 'Tips', 'Announcements', 'Polls', 'Square, portrait, story and wide sizes', 'A caption written for each platform'] })] })} />
    <AppShell hue="create" title="Create" subtitle="Make it, download it, publish it." wide>
      <StudioHub />
    </AppShell>
    </>
  );
}
