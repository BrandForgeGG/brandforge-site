import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { COMMUNITY_LINKS } from '@/lib/community';

export const metadata = { title: 'Connect — BrandForge' };

const SOON = ['Buffer', 'X / Twitter', 'LinkedIn', 'Instagram', 'TikTok', 'YouTube', 'Meta Ads', 'Google Ads'];

export default function ConnectPage() {
  return (
    <AppShell title="Connect" subtitle="Link the channels you create for and learn from.">
      <div className="max-w-2xl space-y-4">
        <div className="bf-card p-5">
          <p className="text-sm font-semibold text-foreground">Live now</p>
          <p className="mt-1 text-sm text-muted">
            Telegram and Discord notifications: link Telegram in Settings to get pings the moment a project moves.
          </p>
          <div className="mt-3 flex gap-2">
            <Link href="/settings" className="bf-button bf-button-primary">Open Settings</Link>
            <a href={COMMUNITY_LINKS.discord.href} target="_blank" rel="noreferrer" className="bf-button">Discord</a>
          </div>
        </div>
        <div className="bf-card p-5">
          <p className="text-sm font-semibold text-foreground">Coming next</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SOON.map((name) => (
              <span key={name} className="rounded-full border border-line px-3 py-1 text-xs text-muted">{name}</span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Tell us in Discord which one you need first — it moves up the list.</p>
        </div>
      </div>
    </AppShell>
  );
}
