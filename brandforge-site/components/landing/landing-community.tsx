'use client';

import { useEffect, useState } from 'react';
import { COMMUNITY_LINKS } from '@/lib/community';

const TEAM_ROLES = [
  { role: 'Product', initial: 'P' },
  { role: 'Developer', initial: 'D' },
  { role: 'Designer', initial: 'De' },
  { role: 'Growth', initial: 'G' },
];

const DISCORD_BLURPLE = 'border-[#5865F2]/35 hover:border-[#5865F2] bg-[#5865F2]/[0.04]';
const DISCORD_ICON = 'bg-[#5865F2]/15 text-[#5865F2]';
const TG_BLUE = 'border-[#229ED9]/35 hover:border-[#229ED9] bg-[#229ED9]/[0.04]';
const TG_ICON = 'bg-[#229ED9]/15 text-[#229ED9]';

type CommunityCard = {
  key: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  cardClass: string;
  iconClass: string;
  icon: 'chat' | 'plane';
  badge?: string;
};

const CARDS: CommunityCard[] = [
  {
    key: 'discord',
    title: 'Discord',
    description: COMMUNITY_LINKS.discord.description,
    href: COMMUNITY_LINKS.discord.href,
    cta: 'Join',
    cardClass: DISCORD_BLURPLE,
    iconClass: DISCORD_ICON,
    icon: 'chat',
  },
  {
    key: 'tg-group',
    title: 'Telegram group',
    description: COMMUNITY_LINKS.telegramGroup.description,
    href: COMMUNITY_LINKS.telegramGroup.href,
    cta: 'Open',
    cardClass: TG_BLUE,
    iconClass: TG_ICON,
    icon: 'plane',
  },
  {
    key: 'tg-channel',
    title: 'Telegram channel',
    description: COMMUNITY_LINKS.telegramChannel.description,
    href: COMMUNITY_LINKS.telegramChannel.href,
    cta: 'Open',
    cardClass: TG_BLUE,
    iconClass: TG_ICON,
    icon: 'plane',
  },
  {
    key: 'manager',
    title: '@headstartup',
    description: COMMUNITY_LINKS.telegramManager.description,
    href: COMMUNITY_LINKS.telegramManager.href,
    cta: 'Message',
    cardClass: TG_BLUE,
    iconClass: TG_ICON,
    icon: 'plane',
    badge: 'Hiring & project manager',
  },
];

function CardIcon({ kind, className }: { kind: CommunityCard['icon']; className: string }) {
  if (kind === 'chat') {
    return (
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${className}`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.8-2.7A8.5 8.5 0 1 1 21 11.5Z" />
          <circle cx="9" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="13" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="17" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${className}`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
        <path d="M21.7 3.3 2.6 10.6c-.9.4-.9 1 .1 1.3l4.9 1.6 1.9 5.7c.2.6.7.8 1.2.4l2.6-2.1 4.7 3.5c.7.5 1.3.2 1.5-.7l3-14.6c.2-1-.4-1.5-1.4-1.1l-.4.3ZM8.9 13.2l8.8-5.6c.4-.2.7-.1.5.2l-7.3 6.7-.3 3-1.7-4.3Z" />
      </svg>
    </span>
  );
}

function discordInviteCode(href: string): string | null {
  try {
    const parts = new URL(href).pathname.split('/').filter(Boolean);
    const code = parts[parts.length - 1];
    return code && code !== 'api' ? code : null;
  } catch {
    return null;
  }
}

export function LandingCommunity() {
  const [discordCounts, setDiscordCounts] = useState<{ members: number; online: number } | null>(null);

  useEffect(() => {
    const code = discordInviteCode(COMMUNITY_LINKS.discord.href);
    if (!code) return;
    let cancelled = false;
    fetch(`https://discord.com/api/v10/invites/${code}?with_counts=true`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { approximate_member_count?: number; approximate_presence_count?: number } | null) => {
        if (cancelled) return;
        if (data && typeof data.approximate_member_count === 'number') {
          setDiscordCounts({
            members: data.approximate_member_count,
            online: typeof data.approximate_presence_count === 'number' ? data.approximate_presence_count : 0,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section id="community" className="border-t border-line px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Community</p>
          <h2 className="mt-2 font-serif text-3xl text-foreground sm:text-4xl">
            The app is live. The community is where builds land first.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Watch us ship, talk to the crew, or bring your project today. A human answers.
          </p>

          <div className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
            {CARDS.map((card) => (
              <a
                key={card.key}
                href={card.href}
                target="_blank"
                rel="noreferrer"
                className={`flex items-start justify-between gap-3 rounded-2xl border px-5 py-4 text-left transition ${card.cardClass}`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <CardIcon kind={card.icon} className={card.iconClass} />
                  <div className="min-w-0">
                    <p className="font-serif text-lg text-foreground">{card.title}</p>
                    {card.badge ? (
                      <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-ember">{card.badge}</p>
                    ) : null}
                    <p className="mt-1 text-xs leading-relaxed text-muted">{card.description}</p>
                    {card.key === 'discord' && discordCounts ? (
                      <p className="mt-1.5 text-xs text-trust">
                        {discordCounts.members.toLocaleString()} members · {discordCounts.online.toLocaleString()} online now
                      </p>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 text-sm text-ember">{card.cta} →</span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
