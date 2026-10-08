'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchAuthed, getSessionUser } from '@/lib/browser-auth';

export function JoinClient() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [message, setMessage] = useState('Joining the chat…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setMessage('This invite link is missing its token.');
        return;
      }
      const user = await getSessionUser();
      if (!user) {
        // Sign in, then come straight back here to redeem.
        router.replace(`/login?next=${encodeURIComponent(`/join?token=${token}`)}`);
        return;
      }
      const response = await fetchAuthed('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (response.ok && data.conversationId) {
        router.replace(`/chat?conversationId=${data.conversationId}`);
      } else {
        setMessage(data.error || 'Could not join the chat.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <p className="text-sm text-muted" role="status">{message}</p>
    </main>
  );
}
