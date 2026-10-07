import Link from 'next/link';
import { AppShell } from '@/components/app-shell';

export const metadata = { title: 'Optimize — BrandForge' };

export default function OptimizePage() {
  return (
    <AppShell title="Optimize" subtitle="What worked, and what to change next.">
      <div className="bf-card max-w-2xl p-6">
        <p className="text-sm text-foreground">No data to optimize yet.</p>
        <p className="mt-1 text-sm text-muted">
          Optimize reads results from your connected channels. Until a channel is connected there is nothing real to
          analyse, and we won&apos;t invent numbers. Meanwhile you can ask in chat for a review of any draft or live page.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/connect" className="bf-button bf-button-primary">Connect a channel</Link>
          <Link href="/chat" className="bf-button">Review something in chat</Link>
        </div>
      </div>
    </AppShell>
  );
}
