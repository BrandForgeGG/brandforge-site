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
    const timer = window.setInterval(() => void reload(), 15000);
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

const pill = 'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition';

// The AI switch in the top bar: a clear "AI on" or "AI paused" with what it does. The owner can pause the
// AI and call the team in one tap, or just pause it; pausing lasts until it is switched on again.
export function AiPill({ aiEnabled, canControl, onPause, onCallTeam, onResume }: { aiEnabled: boolean; canControl: boolean; onPause: () => void; onCallTeam: () => void; onResume: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) return event.key === 'Escape' ? setOpen(false) : undefined;
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const dot = <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${aiEnabled ? 'bg-success' : 'bg-muted'}`} />;
  if (!canControl) {
    return (
      <span className={`${pill} border-line text-muted`} data-tip={aiEnabled ? 'The AI is answering in this chat' : 'The AI is paused in this chat'} data-tip-pos="below">
        {dot}
        <span className="hidden sm:inline">{aiEnabled ? 'AI on' : 'AI paused'}</span>
      </span>
    );
  }

  return (
    <div ref={root} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`${pill} ${aiEnabled ? 'border-line text-foreground hover:border-ember' : 'border-ember/50 bg-ember/10 text-foreground'}`}>
        {dot}
        <span className="hidden sm:inline">{aiEnabled ? 'AI on' : 'AI paused'}</span>
        <span className="sm:hidden">AI</span>
      </button>
      {open ? (
        <div role="menu" className="bf-menu absolute right-0 top-full z-40 mt-2 w-72 p-1.5">
          {aiEnabled ? (
            <>
              <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-overlay" onClick={() => { setOpen(false); onCallTeam(); }}>
                <span className="block text-sm font-medium text-foreground">Pause the AI and call the team</span>
                <span className="block text-xs text-muted">The AI goes quiet and a person from the team picks this up.</span>
              </button>
              <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-overlay" onClick={() => { setOpen(false); onPause(); }}>
                <span className="block text-sm font-medium text-foreground">Just pause the AI</span>
                <span className="block text-xs text-muted">No more AI replies until you switch it back on.</span>
              </button>
            </>
          ) : (
            <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-overlay" onClick={() => { setOpen(false); onResume(); }}>
              <span className="block text-sm font-medium text-foreground">Turn the AI back on</span>
              <span className="block text-xs text-muted">It answers again from your next message.</span>
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

const bar = 'mx-auto mb-1.5 flex max-w-3xl flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border px-3 py-1.5';

// The one-line notices above the composer: AI paused, the hint that tells people they can pause it and call
// the team, and the access requests (a participant asking, an owner deciding).
export function AiNotices({
  aiEnabled,
  isOwner,
  access,
  showHint,
  onResume,
  onCallTeam,
  onRequestAccess,
  onDecide,
}: {
  aiEnabled: boolean;
  isOwner: boolean;
  access: AiAccessInfo | null;
  showHint: boolean;
  onResume: () => void;
  onCallTeam: () => void;
  onRequestAccess: () => void;
  onDecide: (userId: string, decision: 'grant' | 'deny') => void;
}) {
  const [hintGone, setHintGone] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a browser-only flag
      setHintGone(window.sessionStorage.getItem('brandforge:ai-hint-gone') === '1');
    } catch {
      /* storage blocked: the hint simply shows */
    }
  }, []);

  const notices: React.ReactNode[] = [];

  if (isOwner) {
    for (const person of access?.pending ?? []) {
      notices.push(
        <div key={person.userId} className={`${bar} border-ember/30 bg-ember/10`} role="region" aria-label="AI access request">
          <p className="min-w-0 text-sm text-foreground">{person.name} asked to use the AI in this chat.</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => onDecide(person.userId, 'grant')} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90">Allow</button>
            <button type="button" onClick={() => onDecide(person.userId, 'deny')} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember">Not now</button>
          </div>
        </div>,
      );
    }
  } else if (access && access.state !== 'allowed') {
    notices.push(
      <div key="request" className={`${bar} border-line bg-panel`} role="region" aria-label="AI access">
        <p className="min-w-0 text-sm text-foreground">
          {access.state === 'requested' ? 'Request sent. You can use the AI once the chat owner allows it. Your messages still reach everyone here.' : access.state === 'denied' ? 'The chat owner has not allowed AI use for you. Your messages still reach everyone here.' : 'Only the chat owner can use the AI here. Your messages go to the people in this chat.'}
        </p>
        {access.state !== 'requested' ? <button type="button" onClick={onRequestAccess} className="shrink-0 rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90">{access.state === 'denied' ? 'Ask again' : 'Ask to use the AI'}</button> : null}
      </div>,
    );
  }

  if (!aiEnabled) {
    notices.push(
      <div key="paused" className={`${bar} border-ember/30 bg-ember/10`} role="region" aria-label="AI paused">
        <p className="min-w-0 text-sm text-foreground">The AI is paused. The team and the people in this chat can still reply.</p>
        {isOwner ? <button type="button" onClick={onResume} className="shrink-0 rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90">Turn it back on</button> : null}
      </div>,
    );
  } else if (isOwner && showHint && !hintGone) {
    notices.push(
      <div key="hint" className={`${bar} border-line bg-transparent`} role="note">
        <p className="min-w-0 text-xs text-muted">Want a person instead? You can tell the AI to stop and call the team at any time.</p>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onCallTeam} className="text-xs font-semibold text-ember underline-offset-2 hover:underline">Pause AI and call the team</button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              try {
                window.sessionStorage.setItem('brandforge:ai-hint-gone', '1');
              } catch {
                /* ignore */
              }
              setHintGone(true);
            }}
            className="px-1 text-muted hover:text-foreground"
          >
            ×
          </button>
        </div>
      </div>,
    );
  }

  if (notices.length === 0) return null;
  return <div className="px-4 sm:px-6">{notices}</div>;
}
