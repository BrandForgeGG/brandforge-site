'use client';

import { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';

// The rail loads on the client only. Until it arrives, a same-width placeholder holds its
// place so moving between Create, Distribute, Projects and the chat never makes the page
// jump sideways.
function RailPlaceholder() {
  return <aside className="hidden h-dvh w-72 shrink-0 border-r border-line bg-deep md:block" aria-hidden="true" />;
}

const ConversationRail = dynamic(
  () => import('@/components/conversation-rail').then((mod) => mod.ConversationRail),
  { ssr: false, loading: () => <RailPlaceholder /> }
);

// Shared frame for every page outside the chat: the same rail, a quiet one-line header and a
// single centred column, so leaving the chat for another page feels like the same app.
export function AppShell({
  title,
  subtitle,
  actions,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Dashboards and tables get the full width; reading pages keep a calm column. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [isRailOpen, setIsRailOpen] = useState(false);

  return (
    <div className="bf-page flex h-dvh overflow-hidden">
      <Suspense fallback={<RailPlaceholder />}>
        <ConversationRail isMobileOpen={isRailOpen} onMobileClose={() => setIsRailOpen(false)} />
      </Suspense>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className={`mx-auto w-full px-5 pb-16 pt-4 sm:px-8 ${wide ? "max-w-7xl" : "max-w-3xl"}`}>
          <header className="flex items-center justify-between gap-3 pb-5">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsRailOpen(true)}
                className="rounded-lg p-2 text-muted transition hover:bg-overlay hover:text-foreground md:hidden"
                aria-label="Open navigation"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M3 6h14M3 10h14M3 14h14" />
                </svg>
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
                {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
              </div>
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
          </header>

          <div className="bf-page-in">{children}</div>
        </div>
      </main>
    </div>
  );
}
