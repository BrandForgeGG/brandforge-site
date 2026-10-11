import { roleBadge } from '@/lib/identity-display';

// Member, BrandForge Team or Admin as a small colored pill, the same everywhere a person's name appears. Colors are
// mixed from one hue each, so the badge reads on the light and the dark look: blue for members, the brand orange
// for the team, violet for admins.
const HUE: Record<'member' | 'team' | 'admin', string> = {
  member: '#5b9cf5',
  team: '#ff7a3d',
  admin: '#a37cf5',
};

export function RoleBadge({ role, className = '' }: { role: string | null | undefined; className?: string }) {
  const badge = roleBadge(role);
  const hue = HUE[badge.key];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-px text-[10px] font-semibold leading-4 tracking-wide ${className}`}
      style={{
        color: `color-mix(in srgb, ${hue} 74%, var(--foreground))`,
        backgroundColor: `color-mix(in srgb, ${hue} 15%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue} 32%, transparent)`,
      }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hue }} />
      {badge.label}
    </span>
  );
}
