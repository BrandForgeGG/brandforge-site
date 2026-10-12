import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { LogoutConfirm } from '@/components/logout-confirm';

export const metadata: Metadata = pageMeta({ path: '/logout', title: 'Log out — BrandForge', description: 'Confirm that you want to log out of BrandForge.', noindex: true });

export default function LogoutPage() {
  return <LogoutConfirm />;
}
