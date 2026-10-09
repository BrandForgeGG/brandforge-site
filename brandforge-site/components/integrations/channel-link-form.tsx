'use client';

import { useState } from 'react';
import type { Channel, ChannelKind } from '@/components/integrations/use-channels';

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const btnPrimary = 'rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50';

// The form that checks and links one channel. Each platform shows only what it needs, with the
// steps in plain words. Nothing is saved until the platform itself confirms it.
export function ChannelLinkForm({ kind, telegramLinked, onLinked }: { kind: ChannelKind; telegramLinked: boolean; onLinked: (channel: Channel) => void }) {
  const [input, setInput] = useState({ channel: '', webhook: '', handle: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link() {
    setBusy(true);
    setError(null);
    try {
      const body = kind === 'telegram' ? { kind, channel: input.channel } : kind === 'discord' || kind === 'slack' ? { kind, webhook: input.webhook } : { kind, handle: input.handle, password: input.password };
      const res = await fetch('/api/carousel/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'Could not link that.');
      setInput({ channel: '', webhook: '', handle: '', password: '' });
      onLinked(data.channel as Channel);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {kind === 'telegram' ? (
        <>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted">
            <li>Add @brandforge_bot to your channel as an administrator that can post.</li>
            <li>{telegramLinked ? 'Your own Telegram is linked, good.' : 'Link your own Telegram first (the alerts row above), so we know you are the admin.'}</li>
            <li>Type the channel name below.</li>
          </ol>
          <label className="block text-sm text-foreground">
            Channel
            <input className={`${field} mt-1.5`} value={input.channel} onChange={(e) => setInput({ ...input, channel: e.target.value })} placeholder="@yourchannel" autoCapitalize="none" />
          </label>
        </>
      ) : null}
      {kind === 'discord' ? (
        <>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted">
            <li>In Discord open Edit Channel, then Integrations, then Webhooks.</li>
            <li>New Webhook, then Copy Webhook URL.</li>
            <li>Paste it below. It is kept encrypted and used only to post your carousels.</li>
          </ol>
          <label className="block text-sm text-foreground">
            Webhook address
            <input className={`${field} mt-1.5`} value={input.webhook} onChange={(e) => setInput({ ...input, webhook: e.target.value })} placeholder="https://discord.com/api/webhooks/…" autoCapitalize="none" autoComplete="off" />
          </label>
        </>
      ) : null}
      {kind === 'slack' ? (
        <>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted">
            <li>In Slack, open your workspace Apps page and add &quot;Incoming Webhooks&quot;.</li>
            <li>Add a new webhook and pick the channel it should post to.</li>
            <li>Copy the webhook URL and paste it below. It is kept encrypted and used only to post for you.</li>
          </ol>
          <label className="block text-sm text-foreground">
            Webhook address
            <input className={`${field} mt-1.5`} value={input.webhook} onChange={(e) => setInput({ ...input, webhook: e.target.value })} placeholder="https://hooks.slack.com/services/…" autoCapitalize="none" autoComplete="off" />
          </label>
          <p className="text-xs text-muted">Slack webhooks take text, not pictures, so carousels are not posted here. Updates, polls, quizzes and threads are.</p>
        </>
      ) : null}
      {kind === 'tumblr' ? (
        <>
          <p className="text-xs leading-relaxed text-muted">You approve BrandForge on Tumblr&apos;s own page. We never see your password, and you can revoke access in your Tumblr settings at any time. Posts go to your primary blog.</p>
          <a href="/api/integrations/tumblr/start" className={btnPrimary + ' inline-block'}>Connect with Tumblr</a>
        </>
      ) : null}
      {kind === 'bluesky' ? (
        <>
          <p className="text-xs leading-relaxed text-muted">Use an app password, never your main one: Bluesky, Settings, App Passwords, Add. You can revoke it there at any time. Long carousels go out as a thread, four pictures a post.</p>
          <label className="block text-sm text-foreground">
            Handle
            <input className={`${field} mt-1.5`} value={input.handle} onChange={(e) => setInput({ ...input, handle: e.target.value })} placeholder="name.bsky.social" autoCapitalize="none" />
          </label>
          <label className="block text-sm text-foreground">
            App password
            <input className={`${field} mt-1.5`} type="password" value={input.password} onChange={(e) => setInput({ ...input, password: e.target.value })} placeholder="xxxx-xxxx-xxxx-xxxx" autoComplete="off" />
          </label>
        </>
      ) : null}
      {kind !== 'tumblr' ? (
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void link()}>
          {busy ? 'Checking…' : 'Check and connect'}
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
