import { Suspense } from 'react';
import { ChatWorkspace } from '@/components/chat-workspace';

// The front door is the product: brandforge.gg opens straight into a chat. Signed-out visitors
// start a guest chat with their first message; the long-form pitch lives at /overview.
export const metadata = {
  title: 'BrandForge: AI and people, one workspace',
  description:
    'Describe an idea, paste a URL or drop a file. AI researches, plans and creates; your team and vetted specialists join the same chat.',
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
          <p className="text-sm text-muted">Loading…</p>
        </main>
      }
    >
      <ChatWorkspace />
    </Suspense>
  );
}
