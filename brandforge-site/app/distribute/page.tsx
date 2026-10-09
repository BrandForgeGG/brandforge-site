import { AppShell } from '@/components/app-shell';
import { DistributeHub } from '@/components/carousel/distribute-hub';

export const metadata = {
  title: 'Distribute — BrandForge',
  description: 'Carousels, updates, polls, quizzes and threads: write it, see it on each platform, post it to your channels.',
};

export default function DistributePage() {
  return (
    <AppShell title="Distribute" subtitle="Write it, see it on each platform, post it." wide>
      <DistributeHub />
    </AppShell>
  );
}
