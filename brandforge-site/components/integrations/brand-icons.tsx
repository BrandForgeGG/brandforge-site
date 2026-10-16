// Small drawn marks for each service, inside a tile. A connected service shows in its own colour;
// one that is not connected is drawn flat and grey, so the state reads before any word does.
export type ServiceId = 'telegram' | 'discord' | 'bluesky' | 'instagram' | 'tiktok' | 'linkedin' | 'x' | 'facebook' | 'youtube' | 'slack' | 'tumblr' | 'mastodon' | 'threads';

export const SERVICES: Record<ServiceId, { name: string; color: string }> = {
  telegram: { name: 'Telegram', color: '#229ED9' },
  discord: { name: 'Discord', color: '#5865F2' },
  bluesky: { name: 'Bluesky', color: '#1185FE' },
  instagram: { name: 'Instagram', color: '#E1306C' },
  tiktok: { name: 'TikTok', color: '#161823' },
  linkedin: { name: 'LinkedIn', color: '#0A66C2' },
  x: { name: 'X', color: '#111111' },
  facebook: { name: 'Facebook', color: '#1877F2' },
  youtube: { name: 'YouTube', color: '#FF0000' },
  slack: { name: 'Slack', color: '#4A154B' },
  tumblr: { name: 'Tumblr', color: '#001935' },
  mastodon: { name: 'Mastodon', color: '#6364FF' },
  threads: { name: 'Threads', color: '#101010' },
};

// Most used first: the order every list of networks follows across the site.
export const RANK: ServiceId[] = ['instagram', 'facebook', 'youtube', 'tiktok', 'x', 'linkedin', 'threads', 'telegram', 'discord', 'slack', 'bluesky', 'mastodon', 'tumblr'];

export function byRank<T>(items: T[], idOf: (item: T) => string): T[] {
  const at = (item: T) => {
    const i = RANK.indexOf(idOf(item) as ServiceId);
    return i < 0 ? RANK.length : i;
  };
  return [...items].sort((a, b) => at(a) - at(b));
}

const GLYPH: Record<ServiceId, React.ReactNode> = {
  telegram: <path d="M4 11.4l15-6.2-2.6 13.2-4.2-3.1-2.3 2.2-.4-4.3L16 8.6l-8.3 4.7L4 11.4z" />,
  discord: <path d="M7 8c1.6-.8 3.3-1 5-1s3.4.2 5 1l1.4 7.6c-1.5 1-3 1.6-4.6 1.9l-.8-1.3c-.7.1-1.3.2-1 .2s-.3-.1-1-.2l-.8 1.3c-1.6-.3-3.1-.9-4.6-1.9L7 8zm2.3 4.2a1.1 1.3 0 100 2.6 1.1 1.3 0 000-2.6zm5.4 0a1.1 1.3 0 100 2.6 1.1 1.3 0 000-2.6z" />,
  bluesky: <path d="M7.2 6c1.9 1.4 3.9 4.2 4.8 5.7C12.9 10.2 14.9 7.4 16.8 6 18.2 5 20.5 4.2 20.5 6.7c0 .5-.3 4.3-.5 4.9-.6 2.1-2.8 2.6-4.7 2.3 3.4.6 4.2 2.5 2.4 4.4-3.5 3.6-5-.9-5.4-2-.1-.2-.1-.3-.1-.2 0-.1 0 0-.1.2-.4 1.1-1.9 5.6-5.4 2-1.8-1.9-1-3.8 2.4-4.4-1.9.3-4.1-.2-4.7-2.3-.2-.6-.5-4.4-.5-4.9C3.5 4.2 5.8 5 7.2 6z" transform="translate(-1.5 -.5) scale(.9)" />,
  instagram: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.2" cy="7.8" r="1" />
    </>
  ),
  tiktok: <path d="M13 5v9.2a2.7 2.7 0 11-2.7-2.7M13 5c.3 2 1.6 3.3 3.8 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  linkedin: <path d="M6 9.5h2.5V18H6zM7.25 5.6a1.45 1.45 0 110 2.9 1.45 1.45 0 010-2.9zM10.5 9.5H13v1.2c.5-.9 1.5-1.4 2.7-1.4 2.3 0 3.3 1.4 3.3 3.8V18h-2.5v-4.4c0-1.1-.4-1.8-1.4-1.8-1.1 0-1.6.8-1.6 1.9V18h-2.5z" />,
  x: <path d="M6 5.5h3.2l3.5 4.8 4.2-4.8h1.6l-5.1 5.8L19 18.5h-3.2l-3.7-5-4.4 5H6.1l5.4-6.1L6 5.5z" />,
  facebook: <path d="M13.5 19v-6h2l.4-2.5h-2.4V9c0-.8.3-1.3 1.4-1.3h1.1V5.5c-.4 0-1.1-.1-1.9-.1-2 0-3.3 1.2-3.3 3.4v1.7H8.7V13h2.1v6z" />,
  slack: <path d="M9.5 5.5a1.5 1.5 0 013 0V8H11a1.5 1.5 0 01-1.5-1.5v-1zM5.5 9.5a1.5 1.5 0 000 3H8V11a1.5 1.5 0 00-1.5-1.5h-1zM14.5 11.5a1.5 1.5 0 000-3H12V10a1.5 1.5 0 001.5 1.5h1zM11.5 14.5a1.5 1.5 0 01-3 0V12H10a1.5 1.5 0 011.5 1.5v1z" />,
  tumblr: <path d="M13.4 18.2c-2.600 0-3.800-1.400-3.800-3.500V10.500H8V8.300c1.700-.6 2.400-2 2.500-3.800h2.100v3.500h2.400v2.500h-2.400v3.700c0 1 .5 1.400 1.300 1.400h1.100v2.600z" />,
  mastodon: <path d="M6.5 7.2C6.5 5.8 7.6 5 9 5h6c1.4 0 2.5.8 2.5 2.2v5.6c0 1.4-1.1 2.2-2.5 2.2h-1.2c0 1 .8 1.6 2.2 1.6H15c-.5 1.3-1.8 1.6-3.2 1.6C9.5 18.2 6.5 17 6.5 12.8V7.2zm3 1.700v3.800m5-3.800v3.800M12 8.900v3.800" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
  threads: <path d="M16.3 11.2c-.1-.05-.2-.1-.3-.14-.18-3.3-1.98-5.2-5.02-5.22h-.04c-1.82 0-3.33.78-4.26 2.19l1.67 1.15c.7-1.06 1.79-1.28 2.6-1.28h.03c1 0 1.76.3 2.24.87.35.42.59 1 .7 1.73a12.4 12.4 0 0 0-2.83-.14c-2.84.16-4.67 1.82-4.55 4.13.06 1.17.65 2.18 1.65 2.84.85.56 1.94.83 3.08.77 1.5-.08 2.68-.65 3.5-1.7.63-.8 1.02-1.82 1.2-3.12.72.43 1.25 1 1.54 1.69.5 1.17.53 3.08-1.03 4.64-1.37 1.37-3.01 1.96-5.5 1.98-2.75-.02-4.84-.9-6.2-2.63C3.3 15.4 2.63 13.1 2.6 10.2c.03-2.9.7-5.2 2-6.85 1.36-1.73 3.45-2.61 6.2-2.63 2.78.02 4.9.91 6.3 2.65.69.85 1.2 1.92 1.55 3.17l1.95-.52c-.42-1.55-1.08-2.88-1.98-3.99C16.8.44 14.18-.68 10.8-.7h-.01C7.42-.68 4.83.45 3.08 2.66 1.53 4.63.72 7.37.7 10.2v.02c.03 2.83.83 5.57 2.38 7.54 1.75 2.21 4.34 3.34 7.71 3.36h.01c3-.02 5.11-.8 6.85-2.54 2.28-2.28 2.2-5.13 1.46-6.88-.54-1.25-1.56-2.27-2.95-2.94zm-5.2 4.9c-1.25.07-2.55-.49-2.62-1.69-.05-.89.63-1.88 2.68-2 .23-.01.47-.02.69-.02.75 0 1.44.07 2.07.21-.24 2.94-1.62 3.43-2.82 3.5z" transform="translate(1.3 1.6) scale(.9)" />,
  youtube: <path d="M19.6 8.2c-.2-.8-.8-1.4-1.6-1.6C16.6 6.3 12 6.3 12 6.3s-4.6 0-6 .3C5.2 6.8 4.6 7.4 4.4 8.2 4.1 9.6 4.1 12 4.1 12s0 2.4.3 3.8c.2.8.8 1.4 1.6 1.6 1.4.3 6 .3 6 .3s4.6 0 6-.3c.8-.2 1.4-.8 1.6-1.6.3-1.4.3-3.8.3-3.8s0-2.4-.3-3.8zM10.3 14.3V9.7L14.3 12z" />,
};

export function ServiceTile({ id, on, size = 44 }: { id: ServiceId; on: boolean; size?: number }) {
  const { color } = SERVICES[id];
  return (
    <span
      aria-hidden="true"
      className={`relative flex shrink-0 items-center justify-center rounded-xl transition ${on ? 'text-white shadow-md' : 'border border-dashed border-line bg-overlay text-muted'}`}
      style={{
        width: size,
        height: size,
        ...(on ? { background: id === 'instagram' ? 'linear-gradient(135deg,#F9A03F,#E1306C 55%,#833AB4)' : color, boxShadow: `0 6px 18px -6px ${color}` } : null),
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor">
        {GLYPH[id]}
      </svg>
    </span>
  );
}
