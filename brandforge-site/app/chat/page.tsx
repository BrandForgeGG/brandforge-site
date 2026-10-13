import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { Suspense } from 'react';
import { ChatWorkspace } from '@/components/chat-workspace';

export const metadata: Metadata = pageMeta({ path: "/chat", title: "BrandForge - Project chat", description: "Describe what you want to build. BrandForge turns the conversation into a real project.", noindex: true });

// While the chat loads it already looks like the chat: the sidebar's place and a quiet composer, never a blank page with
// a line of text, so arriving from Create, Distribute or Trade does not look like a reload.
function ChatFrame() {
  return (
    <div className="bf-page flex h-dvh overflow-hidden" aria-busy="true">
      <aside className="bf-rail-ph hidden h-dvh w-72 shrink-0 border-r border-line bg-deep md:block" aria-hidden="true" />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1" />
        <div className="mx-auto w-full max-w-3xl px-6 pb-6">
          <div className="bf-skeleton h-14 rounded-2xl border border-line bg-panel" />
        </div>
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatFrame />}>
      <ChatWorkspace />
    </Suspense>
  );
}
