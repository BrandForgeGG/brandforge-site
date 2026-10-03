// One slim strip at the very top of every surface: landing, chat, and the AppShell pages.
// Open-beta context plus the promise the journey runs on — a human picks the project up.
// Server-safe (no state): it stays until the beta ends, then it is deleted in one commit.
import { COMMUNITY_LINKS } from '@/lib/community';

export function BetaBanner() {
  return (
    <div
      className="border-b border-ember/25 bg-deep"
      role="status"
      aria-label="BrandForge open beta"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 sm:px-6">
        <span className="shrink-0 rounded-full border border-ember/40 bg-ember/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-ember-light">
          Open beta
        </span>
        <p className="order-last w-full min-w-0 truncate text-xs text-muted sm:order-none sm:w-auto sm:flex-1">
          <span className="text-foreground">Real specialists are online.</span> Describe your
          project and one picks it up in your chat.
        </p>
        <span className="ml-auto flex shrink-0 items-center gap-3 text-xs">
          <a
            href={COMMUNITY_LINKS.telegramManager.href}
            target="_blank"
            rel="noreferrer"
            title="Telegram — hiring and project manager"
            className="text-ember-light underline-offset-2 transition hover:text-ember hover:underline"
          >
            Hiring &amp; projects: @headstartup
          </a>
          <a
            href={COMMUNITY_LINKS.discord.href}
            target="_blank"
            rel="noreferrer"
            className="text-ember-light underline-offset-2 transition hover:text-ember hover:underline"
          >
            Discord
          </a>
        </span>
      </div>
    </div>
  );
}
