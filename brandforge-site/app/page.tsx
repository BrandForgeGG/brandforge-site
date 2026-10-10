import { Suspense } from 'react';
import { ChatWorkspace } from '@/components/chat-workspace';

// The front door is the product: brandforge.gg opens straight into a chat. Signed-out visitors
// start a guest chat with their first message; the long-form pitch lives at /overview.
export const metadata = {
  title: 'BrandForge: AI and people, one workspace',
  description:
    'Make every kind of message and publish it. Trade products, services and requests. AI drafts in seconds; people finish the job. Free to start.',
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
          <p className="text-sm text-muted">Loading…</p>
        </main>
      }
    >
      <ChatWorkspace />
    </Suspense>
  );
}
