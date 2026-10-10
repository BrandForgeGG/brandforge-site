'use client';

import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/funnel-client';

type Item = { key: string; label: string; hint: string; icon: string; run: () => void; hidden?: boolean; disabled?: boolean };
type Group = { title: string; items: Item[] };

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

// One "+" for everything you can add to a message, in the style people know from the big assistants: a
// grouped menu with an icon, a name and one line about what comes back. Replaces the separate paperclip and
// Actions buttons.
export function ToolsMenu({
  signedIn,
  hasChat,
  onUpload,
  onInvite,
  onContract,
  onCallTeam,
  onCommand,
}: {
  signedIn: boolean;
  hasChat: boolean;
  onUpload: () => void;
  onInvite: () => void;
  onContract: () => void;
  onCallTeam: (() => void) | null;
  onCommand: (id: 'carousel' | 'plan' | 'trade') => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Closing with Escape puts the focus back on the + so nobody loses their place.
        setOpen(false);
        trigger.current?.focus();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
      if (items.length === 0) return;
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
      items[next].focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups: Group[] = [
    {
      title: 'Add',
      items: [{ key: 'upload', label: 'Upload a file', hint: hasChat ? 'PNG, PDF, TXT, CSV, JSON, ZIP · up to 10 MB' : 'Send a first message, then attach files', icon: 'M15.5 9.5l-5.6 5.6a3.4 3.4 0 01-4.8-4.8l6-6a2.3 2.3 0 013.2 3.2l-6 6a1.1 1.1 0 01-1.6-1.6l5.4-5.4', run: onUpload, disabled: !hasChat }],
    },
    {
      title: 'Make',
      items: [
        { key: 'carousel', label: 'Make a carousel', hint: 'Swipeable slides from one sentence', icon: 'M5 5h8v10H5zM7 3.5h8V13M3.5 7v8', run: () => onCommand('carousel') },
        { key: 'plan', label: 'Plan my idea', hint: 'Scope, roadmap and estimate', icon: 'M4 4.5h4v4H4zM12 4.5h4v4h-4zM8 6.5h4M6 8.5v4h6M12 12.5h4v3h-4z', run: () => onCommand('plan') },
        { key: 'trade', label: 'Hire or get hired', hint: 'List what you offer or need', icon: 'M4 7h11l-3-3M16 13H5l3 3', run: () => onCommand('trade') },
      ],
    },
    {
      title: 'Bring in people',
      items: [
        { key: 'invite', label: 'Invite my team', hint: 'Share this chat with a link', icon: 'M7 8a3 3 0 106 0 3 3 0 00-6 0zM4 16c.5-2.8 2.6-4.5 6-4.5s5.5 1.7 6 4.5', run: onInvite, hidden: !signedIn },
        { key: 'contract', label: 'Create a contract', hint: 'Agree milestones and pay as they land', icon: 'M6 3.5h6l3 3v10H6zM12 3.5v3h3M8 10h5M8 13h5', run: onContract, hidden: !signedIn || !hasChat },
        { key: 'team', label: 'Pause the AI and call the team', hint: 'The AI goes quiet and a person takes over', icon: 'M7.5 4.5v11M12.5 4.5v11', run: onCallTeam ?? (() => undefined), hidden: !onCallTeam || !hasChat },
      ],
    },
  ];

  return (
    <div ref={root} className="bf-menu-root relative">
      <button
        ref={trigger}
        type="button"
        className="bf-composer-tool"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Add or make something"
        data-tip={open ? undefined : "Add a file, make something, bring in people"}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 20 20" className={`h-[18px] w-[18px] transition-transform ${open ? 'rotate-45' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <path d="M10 4v12M4 10h12" />
        </svg>
      </button>
      {open ? (
        <div role="menu" aria-label="Add or make something" className="bf-menu absolute bottom-full left-0 z-40 mb-2 max-h-[min(26rem,50dvh)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-1.5">
          {groups.map((group) => {
            const items = group.items.filter((item) => !item.hidden);
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="py-1">
                <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{group.title}</p>
                {items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      if (item.key !== 'upload') trackEvent('next_step_clicked', { source: item.key });
                      item.run();
                    }}
                    className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-overlay focus:bg-overlay focus:outline-none disabled:opacity-50"
                  >
                    <span className="mt-0.5 text-muted"><Icon path={item.icon} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground">{item.label}</span>
                      <span className="block text-xs leading-snug text-muted">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
