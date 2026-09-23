import { Suspense } from 'react';
import { ChatWorkspace } from '@/components/chat-workspace';

export const metadata = {
  title: 'BrandForge - Project chat',
  description: 'Describe what you want to build. BrandForge turns the conversation into a real project.',
};

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#14171a] px-6 text-[#ece7de]">
          <p className="text-sm text-[#9aa0a6]">Loading your conversation…</p>
        </main>
      }
    >
      <ChatWorkspace />
    </Suspense>
  );
}
