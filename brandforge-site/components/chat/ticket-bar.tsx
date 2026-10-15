'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';

type Status = {
  claimedBy: string | null;
  claimerName: string | null;
  mine: boolean;
  canClaim: boolean;
  canTalk: boolean;
  canManage: boolean;
  team: { id: string; name: string; role: string }[];
};

// For the team, above the composer: who has this chat. A free chat can be claimed in one tap; whoever has it can add a
// teammate or hand it back; everyone else sees who to ask. Only the claimer and the people they add can talk here.
export function TicketBar({ conversationId, onCanTalk }: { conversationId: string; onCanTalk: (canTalk: boolean) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const apply = useCallback(
    (next: Status | null) => {
      setStatus(next);
      if (next) onCanTalk(next.canTalk);
    },
    [onCanTalk]
  );

  useEffect(() => {
    let live = true;
    const load = () =>
      void fetchAuthed(`/api/staff/claim?conversationId=${encodeURIComponent(conversationId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => live && apply(data as Status | null))
        .catch(() => undefined);
    load();
    // Someone else may claim it while this is open.
    const timer = window.setInterval(load, 30_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [conversationId, apply]);

  async function act(action: 'claim' | 'release' | 'add', userId?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchAuthed('/api/staff/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, action, userId }) });
      const data = (await res.json().catch(() => ({}))) as Status & { error?: string };
      if (!res.ok) throw new Error(data.error || 'That did not work. Try again.');
      apply(data);
      setPicking(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;
  const pill = 'rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60';

  return (
    <div className="mb-2 rounded-xl border border-line bg-panel px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${status.claimedBy ? (status.mine ? 'bg-trust' : 'bg-copper') : 'bg-ember bf-pulse'}`} aria-hidden="true" />
        <p className="min-w-0 flex-1 text-xs text-foreground">
          {status.mine ? 'You have this chat. Only you and the people you add can talk here.' : status.claimedBy ? `${status.claimerName ?? 'A teammate'} has this chat.${status.canTalk ? '' : ' Ask them to add you to talk here.'}` : 'Nobody has this chat yet.'}
        </p>
        {status.canClaim ? (
          <button type="button" onClick={() => void act('claim')} disabled={busy} className={`${pill} bg-ember text-on-ember hover:opacity-90`}>
            {busy ? 'Claiming…' : 'Claim it'}
          </button>
        ) : null}
        {status.canManage ? (
          <>
            <button type="button" onClick={() => setPicking((value) => !value)} aria-expanded={picking} disabled={busy} className={`${pill} border border-line text-foreground hover:border-ember`}>
              Add a teammate
            </button>
            <button type="button" onClick={() => void act('release')} disabled={busy} className={`${pill} text-muted hover:text-foreground`}>
              Hand back
            </button>
          </>
        ) : null}
      </div>
      {picking ? (
        status.team.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2" role="group" aria-label="Add a teammate">
            {status.team.map((person) => (
              <button key={person.id} type="button" onClick={() => void act('add', person.id)} disabled={busy} className="rounded-full border border-line px-3 py-1 text-xs text-foreground transition hover:border-ember disabled:opacity-60">
                {person.name}
                <span className="ml-1 text-muted">{person.role === 'admin' ? 'admin' : 'team'}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 border-t border-line pt-2 text-xs text-muted">Everyone on the team is already in this chat.</p>
        )
      ) : null}
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
