import { AuthSplit } from '@/components/auth-split';

export const metadata = {
  title: 'Sign in — BrandForge',
  description:
    'Continue with Google or email to describe your project, get a priced proposal, and fund it in escrow.',
};

export default function LoginPage() {
  return <AuthSplit />;
}
