import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { Suspense } from 'react';
import { ChatWorkspace } from '@/components/chat-workspace';

export const metadata: Metadata = pageMeta({ path: "/chat", title: "BrandForge - Project chat", description: "Describe what you want to build. BrandForge turns the conversation into a real project.", noindex: true });

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
          <p className="text-sm text-muted">Loading your conversation…</p>
        </main>
      }
    >
      <ChatWorkspace />
    </Suspense>
  );
}
