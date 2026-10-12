import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { AppShell } from '@/components/app-shell';
import { AdminDashboard } from '@/components/admin/admin-dashboard';

export const metadata: Metadata = pageMeta({ path: "/admin", title: "Dashboard — BrandForge", description: "BrandForge: AI and people, one workspace.", noindex: true });

export default function AdminPage() {
  return (
    <AppShell wide title="Dashboard" subtitle="Everything that is happening, in one place.">
      <AdminDashboard />
    </AppShell>
  );
}
