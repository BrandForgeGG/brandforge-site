import { Suspense } from 'react';
import { JoinClient } from './join-client';

export const metadata = { title: 'Join a chat — BrandForge', robots: { index: false } };

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinClient />
    </Suspense>
  );
}
