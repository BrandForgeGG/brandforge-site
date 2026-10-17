'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAuthed } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { trackEvent } from '@/lib/funnel-client';

const KEY = 'bf:pending-task';

/** A task typed before signing in comes back after it (Projects and this card both read it). */
export function readPendingTask(): { title: string; funds: string; details: string } | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as { title: string; funds: string; details: string }) : null;
  } catch {
    return null;
  }
}

export function clearPendingTask(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

// The third card next to the monthly plans: one task, one time, the visitor's own budget. Sending it opens a chat where the
// team accepts it or proposes a price, and the buyer funds it there.
export function CustomTaskCard() {
  const router = useRouter();
  const { openLogin } = useLogin();
  const [title, setTitle] = useState('');
  const [funds, setFunds] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const pending = readPendingTask();
    if (!pending) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore a task typed before signing in
    setTitle(pending.title);
    setFunds(pending.funds);
    setDetails(pending.details);
  }, []);

  async function send() {
    setBusy(true);
    setError('');
    trackEvent('next_step_clicked', { source: 'pricing_custom' });
    const res = await fetchAuthed('/api/tasks/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, funds, details }) }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { chatId?: string; error?: string }) : {};
    setBusy(false);
    if (res?.status === 401) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify({ title, funds, details }));
      } catch {
        /* storage blocked: the fields stay filled on this page */
      }
      openLogin({ reason: 'signin', next: '/projects' });
      return;
    }
    if (!res?.ok || !data.chatId) {
      setError(data.error || 'Could not send it. Try again.');
      return;
    }
    clearPendingTask();
    router.push(`/chat?conversationId=${data.chatId}`);
  }

  const field = 'w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-ember focus:outline-none';
  return (
    <div className="relative flex flex-col rounded-3xl border border-line bg-panel p-6">
      <span className="absolute -top-3 left-6 rounded-full border border-line bg-panel px-3 py-1 text-[11px] font-semibold text-foreground">One time</span>
      <p className="font-serif text-2xl text-foreground">Custom task</p>
      <p className="mt-1 text-sm text-foreground/75">One task, your budget.</p>
      <p className="mt-5 flex items-baseline gap-1 text-foreground">
        <span className="font-serif text-4xl">From €50</span>
      </p>
      <div className="mt-5 flex-1 space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="The task, e.g. Landing page" aria-label="The task" className={field} />
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={4000} placeholder="What it should do, and when you need it" aria-label="Details" className={`${field} resize-none`} />
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground" aria-hidden="true">€</span>
          <input value={funds} onChange={(e) => setFunds(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="Your budget" aria-label="Your budget in euros" className={`${field} pl-7`} />
        </div>
      </div>
      <div className="mt-6 space-y-2">
        <button type="button" onClick={() => void send()} disabled={busy} className="block w-full rounded-xl border border-line px-4 py-2.5 text-center text-sm font-semibold text-foreground transition hover:border-ember disabled:opacity-60">{busy ? 'Sending…' : 'Send to the team'}</button>
        <p className="text-center text-xs text-foreground/70">The team accepts it or proposes a price.</p>
        {error ? <p role="alert" className="text-center text-xs text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
