import { AppShell } from '@/components/app-shell';
import { OptimizeHub } from '@/components/optimize/optimize-hub';

export const metadata = {
  title: 'Optimize — BrandForge',
  description: 'Audit a page and sharpen your own words, free. Nothing invented.',
};

export default function OptimizePage() {
  return (
    <AppShell title="Optimize" subtitle="Fix what is weak, with nothing invented.">
      <OptimizeHub />
    </AppShell>
  );
}
