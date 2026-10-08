import { AppShell } from '@/components/app-shell';
import { AdminDashboard } from '@/components/admin/admin-dashboard';

export const metadata = { title: 'Dashboard — BrandForge' };

export default function AdminPage() {
  return (
    <AppShell wide title="Dashboard" subtitle="Everything that is happening, in one place.">
      <AdminDashboard />
    </AppShell>
  );
}
