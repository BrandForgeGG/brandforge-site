import type { Metadata } from 'next';
import { pageGraph, pageMeta, toolLd } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';
import { AppShell } from '@/components/app-shell';
import { TradeCenter } from '@/components/trade-center';

export const metadata: Metadata = pageMeta({ path: "/trade", title: "Trade Center — BrandForge", description: "Find people to hire or work for. Agree terms in a private chat and sign a milestone contract." });

export default function TradePage() {
  return (
    <>
      <JsonLd data={pageGraph({ path: '/trade', name: 'Trade', kind: 'CollectionPage', crumbs: [{ name: 'Trade', path: '/trade' }], extra: [toolLd({ path: '/trade', name: 'BrandForge Trade', category: 'BusinessApplication', features: ['List a gig, product, tool, launch or request', 'A private chat for every listing', 'Milestone contracts signed in the chat', 'Escrow held until work is approved'] })] })} />
    <AppShell title="Trade" subtitle="Hire, or get hired. Contracts are signed in a private chat." wide>
      <TradeCenter />
    </AppShell>
    </>
  );
}
