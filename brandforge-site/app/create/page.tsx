import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { AppShell } from '@/components/app-shell';
import { StudioHub } from '@/components/studio/studio-hub';

export const metadata: Metadata = pageMeta({ path: "/create", title: "Create — BrandForge", description: "Make a carousel, an ad, a quote, a tip, an announcement or a poll from one sentence, then download it. Free to make; sign in to download." });

export default function CreatePage() {
  return (
    <AppShell title="Create" subtitle="Make it, download it, publish it." wide>
      <StudioHub />
    </AppShell>
  );
}
