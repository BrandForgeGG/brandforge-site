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
  onCommand: (id: 'carousel' | 'image' | 'plan' | 'trade') => void;
}) {
  const router = useRouter();
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

  // Buyer first: getting the work done by people, then making it yourself, then files and people.
  const groups: Group[] = [
    {
      title: 'Get it done',
      items: [
        { key: 'plan', label: 'Talk to the team', hint: 'Say what you need. A person replies.', icon: 'M4 4.5h12v8H8l-4 3v-11zM7 8h6M7 10.5h4', run: () => onCommand('plan') },
        { key: 'task', label: 'Set up a funded task', hint: 'Name it, set the funds, the team starts', icon: 'M3.5 6.5h13v9h-13zM7.5 6.5V4.5h5v2M3.5 10.5h13', run: () => router.push('/projects') },
        { key: 'plans', label: 'See team plans', hint: '1 to 3 tasks at a time, from €690/mo', icon: 'M4 15.5V9M8 15.5V5M12 15.5v-4M16 15.5V7', run: () => router.push('/pricing') },
      ],
    },
    {
      title: 'Make it yourself, free',
      items: [
        { key: 'image', label: 'An ad or image', hint: 'Ads, quotes, tips and polls', icon: 'M3.5 4.5h13v11h-13zM3.5 13l4-4 3 3 2-2 4 4M13 7.5h.01', run: () => onCommand('image') },
        { key: 'carousel', label: 'A carousel', hint: 'Slides from one sentence', icon: 'M5 5h8v10H5zM7 3.5h8V13M3.5 7v8', run: () => onCommand('carousel') },
      ],
    },
    {
      title: 'Add',
      items: [{ key: 'upload', label: 'A file', hint: hasChat ? 'Up to 10 MB' : 'Send a first message, then attach', icon: 'M15.5 9.5l-5.6 5.6a3.4 3.4 0 01-4.8-4.8l6-6a2.3 2.3 0 013.2 3.2l-6 6a1.1 1.1 0 01-1.6-1.6l5.4-5.4', run: onUpload, disabled: !hasChat }],
    },
    {
      title: 'People',
      items: [
        { key: 'invite', label: 'Invite my team', hint: 'Share this chat with a link', icon: 'M7 8a3 3 0 106 0 3 3 0 00-6 0zM4 16c.5-2.8 2.6-4.5 6-4.5s5.5 1.7 6 4.5', run: onInvite, hidden: !signedIn },
        { key: 'contract', label: 'Create a contract', hint: 'Milestones, paid as they land', icon: 'M6 3.5h6l3 3v10H6zM12 3.5v3h3M8 10h5M8 13h5', run: onContract, hidden: !signedIn || !hasChat },
        { key: 'team', label: 'Pause the AI, call the team', hint: 'A person takes over', icon: 'M7.5 4.5v11M12.5 4.5v11', run: onCallTeam ?? (() => undefined), hidden: !onCallTeam || !hasChat },
        { key: 'trade', label: 'Offer your services', hint: 'We write the listing for Trade', icon: 'M4 7h11l-3-3M16 13H5l3 3', run: () => onCommand('trade') },
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
        data-tip={open ? undefined : "Get it done, make something, add a file"}
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
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold text-foreground/60">{group.title}</p>
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
                    <span className="mt-0.5 text-foreground/80"><Icon path={item.icon} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{item.label}</span>
                      <span className="block text-xs leading-snug text-foreground/70">{item.hint}</span>
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
