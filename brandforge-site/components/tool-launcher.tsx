'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { supabase } from '@/lib/supabase';
import { fetchAuthed } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';

// `prompt` is what the chat receives; {url} / {detail} are replaced with what the person typed.
// `url: true` swaps the notes box for a web address field.
export type ToolOption = {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  url?: boolean;
};

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.hostname.includes('.') ? parsed.toString() : null;
  } catch {
    return null;
  }
}

// Create and Distribute are the tools: pick one, add the one thing it needs, and the chat opens
// with the request already sent (guests included), so the first answer arrives immediately.
export function ToolLauncher({
  title,
  subtitle,
  placeholder,
  options,
}: {
  title: string;
  subtitle: string;
  placeholder: string;
  options: ToolOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(options[0]?.id ?? '');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const option = options.find((item) => item.id === selected) ?? options[0];

  async function start() {
    if (busy) return;
    let message: string;
    if (option.url) {
      const url = normalizeUrl(detail);
      if (!url) {
        setError('Enter a full web address, like yourwebsite.com.');
        return;
      }
      message = option.prompt.replace('{url}', url);
    } else {
      message = option.prompt.replace('{detail}', detail.trim()).trim();
    }

    setBusy(true);
    setError('');
    trackEvent('chat_started', { source: `tool_${option.id}` });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetchAuthed('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialMessage: message, source: `tool_${option.id}`, guest: !session?.user }),
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
    <AppShell title={title} subtitle={subtitle}>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={title}>
        {options.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={item.id === selected}
            onClick={() => {
              setSelected(item.id);
              setError('');
            }}
            className={`bf-card p-3.5 text-left transition ${item.id === selected ? 'border-ember' : 'hover:border-ember/40'}`}
          >
            <p className="text-sm font-semibold text-foreground">{item.label}</p>
            <p className="mt-0.5 text-xs text-muted">{item.hint}</p>
          </button>
        ))}
      </div>

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        {option.url ? (
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            aria-label="Website address"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            placeholder="https://yourwebsite.com"
            className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-base text-foreground placeholder-muted outline-none focus:border-ember"
          />
        ) : (
          <textarea
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            rows={3}
            aria-label="Details"
            placeholder={placeholder}
            className="w-full resize-none rounded-xl border border-line bg-panel px-4 py-3 text-base text-foreground placeholder-muted outline-none focus:border-ember"
          />
        )}
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" disabled={busy || !detail.trim()} className="bf-button bf-button-primary disabled:opacity-50">
            {busy ? 'Starting…' : 'Start →'}
          </button>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </AppShell>
  );
}
