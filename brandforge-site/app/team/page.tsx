import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { AppShell } from '@/components/app-shell';
import { TeamDashboard } from '@/components/team/team-dashboard';

export const metadata: Metadata = pageMeta({ path: '/team', title: 'Team — BrandForge', description: 'The BrandForge team dashboard.', noindex: true });

export default function TeamPage() {
  return (
    <AppShell wide title="Team" subtitle="Clients, money and the road to €10k a month.">
      <TeamDashboard />
    </AppShell>
  );
}
