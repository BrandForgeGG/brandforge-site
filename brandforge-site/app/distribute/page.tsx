import { AppShell } from '@/components/app-shell';
import { DistributeHub } from '@/components/distribute/distribute-hub';

export const metadata = {
  title: 'Distribute — BrandForge',
  description: 'Say what you promote, paste a link or attach a file. The AI writes a week of posts: what to make, when to post it, and a caption that asks for something different each time.',
};

export default function DistributePage() {
  return (
    <AppShell title="Distribute" subtitle="One sentence in, a week of posts out.">
      <DistributeHub />
    </AppShell>
  );
}
