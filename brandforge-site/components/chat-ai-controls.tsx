'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';

export type AiAccessInfo = { isOwner: boolean; state: 'allowed' | 'requested' | 'denied' | 'none'; pending: { userId: string; name: string }[] };

// Who may make the AI generate in this chat, kept fresh while the chat is open. The owner also sees who is
// asking. Checked again by the server on every message, so this is only what the screen shows.
export function useAiAccess(conversationId: string, enabled: boolean) {
  const [access, setAccess] = useState<AiAccessInfo | null>(null);
  const live = useRef(true);

  const reload = useCallback(async () => {
    if (!conversationId || !enabled) return;
    try {
      const res = await fetchAuthed(`/api/conversations/${conversationId}/ai-access`);
      if (res.ok && live.current) setAccess((await res.json()) as AiAccessInfo);
    } catch {
      /* the chat still works; the server decides */
    }
  }, [conversationId, enabled]);

  useEffect(() => {
    live.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load access when the chat changes
    setAccess(null);
    void reload();
    const timer = window.setInterval(() => void reload(), 5000);
    return () => {
      live.current = false;
      window.clearInterval(timer);
    };
  }, [reload]);

  const request = useCallback(async () => {
    const res = await fetchAuthed(`/api/conversations/${conversationId}/ai-access`, { method: 'POST' });
    if (res.ok) await reload();
    return res.ok;
  }, [conversationId, reload]);

  const decide = useCallback(
    async (userId: string, decision: 'grant' | 'deny' | 'revoke') => {
      const res = await fetchAuthed(`/api/conversations/${conversationId}/ai-access`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, decision }) });
      if (res.ok) await reload();
      return res.ok;
    },
    [conversationId, reload],
  );

  return { access, reload, request, decide };
}

// The AI switch: a small toggle in the top bar and nothing else. A thumbs up means the AI answers; a raised hand means it stays quiet
// and the chat is just people. It says what it is only to screen readers and on hover. No label, no banner, no
// confirmation: the box under the chat says "Message the team" when it is off, and that is all the page needs.
export function AiSwitch({ aiEnabled, canControl, onToggle }: { aiEnabled: boolean; canControl: boolean; onToggle: () => void }) {
  if (!canControl) return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aiEnabled}
      aria-label="AI"
      data-tip={aiEnabled ? 'AI on. Tap to turn it off.' : 'AI off. Tap to turn it on.'}
      data-tip-pos="below"
      onClick={onToggle}
      className="group flex h-8 w-12 items-center justify-center"
    >
      <span aria-hidden="true" className={`relative h-6 w-11 rounded-full border transition-colors ${aiEnabled ? 'border-ember/60 bg-ember/25' : 'border-line bg-overlay'}`}>
        <span className={`absolute top-px flex h-[20px] w-[20px] items-center justify-center rounded-full bg-background text-[12px] leading-none shadow transition-all ${aiEnabled ? 'left-[21px]' : 'left-px'}`}>{aiEnabled ? '👍' : '✋'}</span>
      </span>
    </button>
  );
}

const bar = 'mx-auto mb-1.5 flex max-w-3xl flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border px-3 py-1.5';

// The notices above the composer that someone has to act on: a teammate asking to use the AI (the owner decides)
// and a teammate who has not been allowed yet. Nothing about the AI being on or off ever shows up here.
export function AiNotices({
  isOwner,
  access,
  onRequestAccess,
  onDecide,
}: {
  isOwner: boolean;
  access: AiAccessInfo | null;
  onRequestAccess: () => void;
  onDecide: (userId: string, decision: 'grant' | 'deny') => void;
}) {
  const notices: React.ReactNode[] = [];

  if (isOwner) {
    for (const person of access?.pending ?? []) {
      notices.push(
        <div key={person.userId} className={`${bar} border-ember/30 bg-ember/10`} role="region" aria-label="AI access request">
          <p className="min-w-0 text-sm text-foreground">{person.name} asked to use the AI.</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => onDecide(person.userId, 'grant')} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90">Allow</button>
            <button type="button" onClick={() => onDecide(person.userId, 'deny')} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember">Not now</button>
          </div>
        </div>,
      );
    }
  } else if (access && access.state === 'none') {
    notices.push(
      <div key="request" className={`${bar} border-line bg-panel`} role="region" aria-label="AI access">
        <p className="min-w-0 text-sm text-foreground">Only the chat owner can use the AI here.</p>
        <button type="button" onClick={onRequestAccess} className="shrink-0 rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90">Ask to use it</button>
      </div>,
    );
  }

  if (notices.length === 0) return null;
  return <div className="px-4 sm:px-6">{notices}</div>;
}
