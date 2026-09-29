'use client';

import { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { BetaBanner } from '@/components/beta-banner';

const ConversationRail = dynamic(
  () => import('@/components/conversation-rail').then((mod) => mod.ConversationRail),
  { ssr: false, loading: () => null }
);

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [isRailOpen, setIsRailOpen] = useState(false);

  return (
    <div className="bf-page">
      <BetaBanner />
      <div className="mx-auto flex max-w-[1600px]">
        <Suspense fallback={null}>
          <ConversationRail
            isMobileOpen={isRailOpen}
            onMobileClose={() => setIsRailOpen(false)}
          />
        </Suspense>

        <main className="flex min-w-0 flex-1 flex-col p-4 sm:p-6 lg:p-8">
          <header className="mb-6 flex items-center justify-between gap-3 border-b border-white/10 pb-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setIsRailOpen(true)}
                className="rounded-lg p-2 text-[#9aa0a6] transition hover:bg-white/5 hover:text-[#ece7de] md:hidden"
                aria-label="Open navigation"
              >
                <span aria-hidden="true">≡</span>
              </button>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#b8763b]">
                  BrandForge
                </p>
                <h1 className="mt-2 truncate font-serif text-3xl text-[#ece7de]">{title}</h1>
              </div>
            </div>
          </header>

          <div className="mb-6 bf-surface p-4 text-sm text-[#9aa0a6]" role="status">
            {subtitle}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
