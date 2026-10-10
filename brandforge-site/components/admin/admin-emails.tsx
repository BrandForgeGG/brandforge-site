'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';

type Row = { id: string; to: string; subject: string; ok: boolean; error: string | null; at: string };

function when(iso: string) {
  const date = new Date(iso);
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// The latest emails the site tried to send: who got what, and whether the mail provider accepted it.
// "Sent" means the provider took it; it cannot promise the inbox, so a person who says they got nothing
// should also check spam. Search by an address to see everything one person was sent.
export function AdminEmails() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchAuthed(`/api/admin/emails?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json().catch(() => ({}));
      setRows(res.ok ? (data.emails ?? []) : []);
    } catch {
      setRows([]);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  return (
    <section className="border-t border-line pt-6" aria-label="Email activity">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl tracking-[-0.01em] text-foreground">Email activity</h2>
        <button type="button" onClick={() => void load()} className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline">Refresh</button>
      </div>
      <p className="mt-1 text-xs text-muted">The latest emails the site sent. Search an address to see what one person received.</p>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by address or subject" aria-label="Search emails" className="mt-3 w-full max-w-sm rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted" />
      <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-xl border border-line">
        {rows === null ? (
          <p className="px-4 py-6 text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">{query ? 'No emails match.' : 'No emails sent yet. New ones appear here as they go out.'}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start gap-3 px-4 py-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${row.ok ? 'bg-success' : 'bg-danger'}`} aria-label={row.ok ? 'Sent' : 'Failed'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{row.subject}</p>
                  <p className="truncate text-xs text-muted">{row.to}{row.ok ? '' : ` · failed: ${row.error ?? 'unknown'}`}</p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted">{when(row.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
