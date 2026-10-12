import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { AuthSplit } from '@/components/auth-split';

export const metadata: Metadata = pageMeta({ path: "/login", title: "Sign in — BrandForge", description: "Continue with Google or email to describe your project, get a priced proposal, and fund it in escrow.", noindex: true });

export default function LoginPage() {
  return <AuthSplit />;
}
