import type { Metadata } from 'next';
import { pageGraph, pageMeta, toolLd } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';
import { AppShell } from '@/components/app-shell';
import { DistributeHub } from '@/components/distribute/distribute-hub';

export const metadata: Metadata = pageMeta({ path: "/distribute", title: "Distribute — BrandForge", description: "Say what you promote, paste a link or attach a file. The AI writes a week of posts: what to make, when to post it, and a caption that asks for something different each time." });

export default function DistributePage() {
  return (
    <>
      <JsonLd data={pageGraph({ path: '/distribute', name: 'Distribute', kind: 'WebPage', crumbs: [{ name: 'Distribute', path: '/distribute' }], extra: [toolLd({ path: '/distribute', name: 'BrandForge Distribute', category: 'BusinessApplication', features: ['A week of posts from a sentence, link or file', 'Pictures, captions and posting times', 'Post or schedule to Telegram, Discord, Bluesky, Mastodon and Tumblr', 'Download everything as a zip'] })] })} />
    <AppShell title="Distribute" subtitle="One sentence in, a week of posts out." wide>
      <DistributeHub />
    </AppShell>
    </>
  );
}
