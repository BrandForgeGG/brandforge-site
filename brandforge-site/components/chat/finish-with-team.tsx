'use client';

import { useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';

const NOTE: Record<string, string> = {
  carousel: 'Polish the design and the words so it is ready to post.',
  image: 'Polish this picture so it is ready to post.',
  video: 'Polish this video: voice, pacing and the last details, ready to post.',
  article: 'Edit this article so it reads well and is ready to publish.',
};

// Under the newest creation in a chat: one click hands it to the BrandForge team, in this same chat, with a note.
export function FinishWithTeam({ conversationId, kind }: { conversationId: string; kind: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(NOTE[kind] ?? 'Finish this so it is ready to use.');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function send() {
    setState('sending');
    setError('');
    const res = await fetchAuthed(`/api/conversations/${conversationId}/finish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note, kind }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setState('idle');
      setError(data.error || 'Could not send it. Try again.');
      return;
    }
    setState('sent');
  }

  if (state === 'sent') return <p role="status" className="mt-2 text-xs text-success">Sent. A person from the team joins this chat to finish it.</p>;

  return (
    <div className="mt-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-ember/50 bg-ember/10 px-3.5 py-2 text-xs font-semibold text-foreground transition hover:border-ember">
          Have the team finish this
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-line bg-panel p-3">
          <label htmlFor={`finish-${conversationId}`} className="sr-only">Note for the team</label>
          <textarea id={`finish-${conversationId}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} className="w-full resize-none rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void send()} disabled={state === 'sending' || note.trim().length < 3} className="rounded-lg bg-ember px-3.5 py-1.5 text-xs font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-50">
              {state === 'sending' ? 'Sending…' : 'Send to the team'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-foreground">Cancel</button>
          </div>
          {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
