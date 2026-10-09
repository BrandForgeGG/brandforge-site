'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  onPrefill,
  onInvite,
  onContract,
  onCallTeam,
}: {
  signedIn: boolean;
  hasChat: boolean;
  onUpload: () => void;
  onPrefill: (text: string, key: string) => void;
  onInvite: () => void;
  onContract: () => void;
  onCallTeam: (() => void) | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return setOpen(false);
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

  const go = (key: string, text: string) => () => onPrefill(text, key);
  const groups: Group[] = [
    {
      title: 'Add',
      items: [{ key: 'upload', label: 'Upload a file', hint: hasChat ? 'PNG, PDF, TXT, CSV, JSON, ZIP · up to 10 MB' : 'Send a first message, then attach files', icon: 'M15.5 9.5l-5.6 5.6a3.4 3.4 0 01-4.8-4.8l6-6a2.3 2.3 0 013.2 3.2l-6 6a1.1 1.1 0 01-1.6-1.6l5.4-5.4', run: onUpload, disabled: !hasChat }],
    },
    {
      title: 'Make',
      items: [
        { key: 'image', label: 'Create an image', hint: 'A visual, a logo idea or a mockup', icon: 'M4 5h12v10H4zM4 13l3.5-3.5 3 3 2-2L16 14M13 8.2h.01', run: go('image', 'Create an image: ') },
        { key: 'carousel', label: 'Make a carousel', hint: 'Swipeable slides from one sentence', icon: 'M5 5h8v10H5zM7 3.5h8V13M3.5 7v8', run: () => router.push('/create?make=carousel') },
        { key: 'ads', label: 'Write ads', hint: 'Hooks and copy for each platform', icon: 'M3.5 9.5v-3l9-3v9zM12.5 6.5h3a1.5 1.5 0 010 3h-3M6 12.5l1 3.5h2l-.8-3', run: go('ads', 'Create ads: ') },
        { key: 'calendar', label: '30-day content calendar', hint: 'A month of posts, ready to copy', icon: 'M4 5.5h12v10H4zM4 8.5h12M7 3.5v3M13 3.5v3', run: go('calendar', 'Create a 30-day content calendar: ') },
        { key: 'video', label: 'Create a video', hint: 'Short scenes from your idea', icon: 'M3.5 6h9v8h-9zM12.5 9l4-2.5v7L12.5 11', run: go('video', 'Create a video: ') },
        { key: 'audit', label: 'Audit a URL', hint: 'A ranked fix list from your page', icon: 'M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM13 13l3.5 3.5', run: go('audit', 'Audit this URL: https://') },
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
        type="button"
        className="bf-composer-tool"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Add or make something"
        data-tip="Add a file, make something, bring in people"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 20 20" className={`h-[18px] w-[18px] transition-transform ${open ? 'rotate-45' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <path d="M10 4v12M4 10h12" />
        </svg>
      </button>
      {open ? (
        <div role="menu" aria-label="Add or make something" className="bf-menu absolute bottom-full left-0 z-40 mb-2 max-h-[min(28rem,70dvh)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-1.5">
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
