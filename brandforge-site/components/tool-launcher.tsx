'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';

export type ToolOption = { id: string; label: string; hint: string; starter: string };

// Create/Distribute work inside the chat: pick a starting point, add words, a URL or
// notes, and the composer opens pre-filled. The chat is where the work (and the team) lives.
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
  const option = options.find((item) => item.id === selected) ?? options[0];

  function start() {
    const text = [option.starter, detail.trim()].filter(Boolean).join('\n\n');
    try {
      window.sessionStorage.setItem('brandforge:pending-message', text);
    } catch {}
    router.push('/chat');
  }

  return (
    <AppShell title={title} subtitle={subtitle}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={title}>
        {options.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={item.id === selected}
            onClick={() => setSelected(item.id)}
            className={`bf-card p-4 text-left transition ${item.id === selected ? 'border-ember' : 'hover:border-ember/40'}`}
          >
            <p className="text-sm font-semibold text-foreground">{item.label}</p>
            <p className="mt-0.5 text-xs text-muted">{item.hint}</p>
          </button>
        ))}
      </div>
      <div className="mt-4 max-w-2xl">
        <textarea
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          rows={4}
          aria-label="Details"
          placeholder={placeholder}
          className="w-full resize-none rounded-xl border border-line bg-panel px-4 py-3 text-sm text-foreground placeholder-muted outline-none focus:border-ember"
        />
        <button type="button" onClick={start} className="mt-3 bf-button bf-button-primary">
          Open in chat →
        </button>
      </div>
    </AppShell>
  );
}
