import { AppShell } from '@/components/app-shell';
import { DistributePreview } from '@/components/carousel/distribute-preview';

export const metadata = {
  title: 'Distribute — BrandForge',
  description: 'See your carousel as a post on each platform, get captions written, and plan when it goes out.',
};

export default function DistributePage() {
  return (
    <AppShell title="Distribute" subtitle="See it on each platform, get captions, plan when it goes out." wide>
      <DistributePreview />
    </AppShell>
  );
}
