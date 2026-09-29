import { AuthCard } from '@/components/auth-card';

export const metadata = {
  title: 'Sign in — BrandForge',
  description:
    'Sign in with Google to describe your project, get a priced proposal, and fund it in escrow.',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#14171a] px-6 py-12 text-[#ece7de]">
      <AuthCard />
    </main>
  );
}
