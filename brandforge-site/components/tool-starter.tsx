'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchAuthed } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}

// URL in, guest chat out: the first answer arrives before any sign-in.
export function ToolStarter({
  slug,
  prompt,
  cta,
  placeholder,
}: {
  slug: string;
  prompt: string;
  cta: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    trackEvent('tool_page_viewed', { source: slug });
  }, [slug]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const url = normalizeUrl(value);
    if (!url) {
      setError('Enter a full web address, like yourwebsite.com.');
      return;
    }
    setBusy(true);
    setError('');
    trackEvent('chat_started', { source: `tool_${slug}` });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetchAuthed('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialMessage: prompt.replace('{url}', url),
          source: `tool_${slug}`,
          guest: !session?.user,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.conversationId) {
        throw new Error(data.error || 'Could not start. Try again in a moment.');
      }
      router.push(`/chat?conversationId=${data.conversationId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start. Try again in a moment.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-8 max-w-xl">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          inputMode="url"
          autoComplete="url"
          aria-label="Website address"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-base text-foreground placeholder-muted outline-none transition focus:border-ember"
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="rounded-xl bg-ember px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Starting…' : `${cta} →`}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">Free. No account needed.</p>
      )}
    </form>
  );
}
