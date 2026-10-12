import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ path: '/settings', title: 'Settings — BrandForge', description: 'Your profile, connected channels, notifications and plan.', noindex: true });

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
