import { AppShell } from '@/components/app-shell';
import { TradeCenter } from '@/components/trade-center';

export const metadata = {
  title: 'Trade Center — BrandForge',
  description: 'Find people to hire or work for. Agree terms in a private chat and sign a milestone contract.',
};

export default function TradePage() {
  return (
    <AppShell title="Trade" subtitle="Hire, or get hired. Contracts are signed in a private chat.">
      <TradeCenter />
    </AppShell>
  );
}
