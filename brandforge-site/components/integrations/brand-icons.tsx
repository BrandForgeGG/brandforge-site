// Small drawn marks for each service, inside a tile. A connected service shows in its own colour;
// one that is not connected is drawn flat and grey, so the state reads before any word does.
export type ServiceId = 'telegram' | 'discord' | 'bluesky' | 'instagram' | 'tiktok' | 'linkedin' | 'x' | 'facebook' | 'youtube';

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
};

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
