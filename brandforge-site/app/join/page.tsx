import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { Suspense } from 'react';
import { JoinClient } from './join-client';

export const metadata: Metadata = pageMeta({ path: "/join", title: "Join a chat — BrandForge", description: "BrandForge: AI and people, one workspace.", noindex: true });

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinClient />
    </Suspense>
  );
}
