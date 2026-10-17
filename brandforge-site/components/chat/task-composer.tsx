'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAuthed } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';

// Add a task to this chat (a buyer), or offer one with a price (the team). A chat holds as many tasks as needed; each
// becomes its own card. Without a chat yet, the task starts one.
export function TaskComposer({ conversationId, offer, onDone, onClose }: { conversationId: string | null; offer: boolean; onDone: () => void; onClose: () => void }) {
  const router = useRouter();
  const { openLogin } = useLogin();
  const [title, setTitle] = useState('');
  const [funds, setFunds] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setError('');
    const res = await fetchAuthed('/api/tasks/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, funds, details, ...(conversationId ? { chatId: conversationId } : {}) }) }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { chatId?: string; error?: string }) : {};
    setBusy(false);
    if (res?.status === 401) {
      openLogin({ reason: 'signin', next: conversationId ? `/chat?conversationId=${conversationId}` : '/chat' });
      return;
    }
    if (!res?.ok || !data.chatId) {
      setError(data.error || 'Could not send it. Try again.');
      return;
    }
    if (!conversationId) router.push(`/chat?conversationId=${data.chatId}`);
    onDone();
  }

  const field = 'w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-ember focus:outline-none';
  return (
    // A plain div, not a form: this sits inside the composer's form, and forms cannot nest.
    <div className="mb-2 rounded-2xl border border-line bg-panel p-4" aria-label={offer ? 'Offer a task' : 'Add a task'}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-serif text-lg text-foreground">{offer ? 'Offer a task with a price' : 'Add a task'}</p>
        <button type="button" onClick={onClose} className="text-xs font-medium text-foreground/70 hover:text-foreground">Close</button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Task, e.g. Landing page" aria-label="Task" className={field} />
        <input value={funds} onChange={(e) => setFunds(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="€ budget" aria-label="Funds in euros" className={field} />
      </div>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} maxLength={4000} placeholder={offer ? 'What is included, and when it is ready.' : 'What it should do, and when you need it.'} aria-label="Details" className={`${field} mt-2 resize-none`} />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-foreground/70">{offer ? 'The buyer accepts it, then funds it.' : 'From €50. The team accepts it or proposes a price.'}</p>
        <button type="button" disabled={busy} onClick={() => void send()} className="shrink-0 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60">{busy ? 'Sending…' : offer ? 'Send offer' : 'Send task'}</button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
