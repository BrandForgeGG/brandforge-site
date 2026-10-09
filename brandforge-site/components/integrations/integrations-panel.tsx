'use client';

import { useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';
import { ServiceTile, SERVICES, type ServiceId } from '@/components/integrations/brand-icons';
import { ChannelLinkForm } from '@/components/integrations/channel-link-form';
import { useChannels, type ChannelKind } from '@/components/integrations/use-channels';

const COMING: { id: ServiceId; line: string }[] = [
  { id: 'instagram', line: 'Carousels straight to your feed' },
  { id: 'tiktok', line: 'Photo posts and slideshows' },
  { id: 'linkedin', line: 'Document posts for your page' },
  { id: 'x', line: 'Threads with pictures' },
  { id: 'facebook', line: 'Page posts' },
  { id: 'youtube', line: 'Community posts and Shorts' },
];

const SAY: Record<ChannelKind, { line: string; add: string }> = {
  telegram: { line: 'Alerts to you, and carousels to your channel.', add: 'Link a channel' },
  discord: { line: 'Post carousels to a server channel.', add: 'Link a channel' },
  bluesky: { line: 'Post carousels as a thread.', add: 'Link an account' },
  slack: { line: 'Post updates, polls and threads to a channel.', add: 'Link a channel' },
  tumblr: { line: 'Post carousels and text to your blog.', add: 'Connect your blog' },
};

function Pill({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${on ? 'bg-trust/15 text-success' : 'bg-overlay text-muted'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-success' : 'bg-muted/60'}`} aria-hidden="true" />
      {children}
    </span>
  );
}

// Every place BrandForge can reach for you, in one list. A linked service looks alive (its own colour,
// the names you linked, a live badge); one that is not linked looks switched off, with one clear
// button to connect it. Services waiting on a platform's approval say so and let you vote.
export function IntegrationsPanel() {
  const { channels, telegramLinked, tumblrReady, loading, reload, unlink } = useChannels();
  const [open, setOpen] = useState<ChannelKind | null>(null);
  const [code, setCode] = useState<{ code: string; botUrl: string } | null>(null);
  const [alertBusy, setAlertBusy] = useState(false);
  const [alertError, setAlertError] = useState('');
  const [copied, setCopied] = useState(false);
  const [voted, setVoted] = useState<Record<string, boolean>>({});

  async function startAlerts() {
    setAlertBusy(true);
    setAlertError('');
    try {
      const response = await fetchAuthed('/api/identity/telegram-link', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not start Telegram linking.');
      setCode({ code: data.code ?? '', botUrl: data.botUrl ?? '' });
    } catch (cause) {
      setAlertError(cause instanceof Error ? cause.message : 'Could not start Telegram linking.');
    } finally {
      setAlertBusy(false);
    }
  }

  function vote(id: ServiceId) {
    setVoted((current) => ({ ...current, [id]: true }));
    trackEvent('create_interest', { status: `integration-${id}` });
  }

  const btn = 'rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-ember disabled:opacity-50';

  return (
    <div className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-3">
        {(['telegram', 'discord', 'bluesky', 'slack', 'tumblr'] as ChannelKind[]).map((kind) => {
          const mine = channels.filter((c) => c.kind === kind);
          const live = kind === 'telegram' ? telegramLinked || mine.length > 0 : mine.length > 0;
          return (
            <section key={kind} aria-label={SERVICES[kind].name} className={`flex min-w-0 flex-col rounded-2xl border p-4 transition ${live ? 'border-line bg-panel' : 'border-dashed border-line bg-transparent'}`} style={live ? { boxShadow: `inset 3px 0 0 ${SERVICES[kind].color}` } : undefined}>
              <div className="flex items-start gap-3">
                <ServiceTile id={kind} on={live} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{SERVICES[kind].name}</p>
                  <p className="text-xs text-muted">{SAY[kind].line}</p>
                </div>
                <Pill on={live}>{loading ? '…' : live ? 'Connected' : 'Not connected'}</Pill>
              </div>

              {kind === 'telegram' ? (
                <div className="mt-4 rounded-xl border border-line px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">Alerts to you</p>
                      <p className="text-xs text-muted">{telegramLinked ? 'Briefs, proposals and deliveries ping your Telegram.' : 'Get pinged the moment something needs you.'}</p>
                    </div>
                    {telegramLinked ? <span className="text-xs font-semibold text-success">On</span> : code ? null : (
                      <button type="button" className={btn} disabled={alertBusy} onClick={() => void startAlerts()}>{alertBusy ? 'Starting…' : 'Turn on'}</button>
                    )}
                  </div>
                  {!telegramLinked && code ? (
                    <div className="mt-2 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs">
                      <p className="mb-1.5 leading-snug text-muted">Send this code to the bot:</p>
                      <div className="flex items-center gap-2">
                        <code className="select-all font-mono text-sm font-bold tracking-[0.2em] text-foreground">{code.code}</code>
                        <button type="button" className="ml-auto rounded border border-ember/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ember hover:bg-ember/20" onClick={() => void navigator.clipboard?.writeText(code.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? 'Copied' : 'Copy'}</button>
                      </div>
                      {code.botUrl ? <a href={code.botUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block font-semibold text-ember underline-offset-2 hover:underline">Open the bot</a> : null}
                      <button type="button" className="mt-2 block text-[11px] text-muted underline-offset-2 hover:underline" onClick={() => void reload()}>I sent it. Check again.</button>
                    </div>
                  ) : null}
                  {alertError ? <p role="alert" className="mt-2 text-xs text-danger">{alertError}</p> : null}
                </div>
              ) : null}

              <div className="mt-3 flex-1">
                {mine.length > 0 ? (
                  <ul className="space-y-1.5">
                    {mine.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-overlay px-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-foreground">{c.label}</span>
                        <button type="button" className="shrink-0 text-xs text-muted underline-offset-2 hover:text-danger hover:underline" onClick={() => void unlink(c.id)}>Disconnect</button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">{kind === 'telegram' ? 'No channel linked for posting yet.' : 'Nothing linked yet.'}</p>
                )}
              </div>

              <div className="mt-3">
                <button type="button" aria-expanded={open === kind} disabled={kind === 'tumblr' && !tumblrReady && mine.length === 0} className={`${btn} w-full`} onClick={() => setOpen(open === kind ? null : kind)}>
                  {open === kind ? 'Close' : kind === 'tumblr' && !tumblrReady && mine.length === 0 ? 'Coming soon' : mine.length > 0 ? 'Link another' : SAY[kind].add}
                </button>
                {open === kind ? (
                  <div className="mt-3 rounded-xl border border-line p-3">
                    <ChannelLinkForm kind={kind} telegramLinked={telegramLinked} onLinked={() => { setOpen(null); void reload(); }} />
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Waiting for approval</p>
        <p className="mt-1 text-xs text-muted">These platforms make every app apply before it can post for you. We are applying. Tell us which one you need first and it moves up.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {COMING.map(({ id, line }) => (
            <div key={id} className="flex items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2.5">
              <ServiceTile id={id} on={false} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{SERVICES[id].name}</p>
                <p className="truncate text-xs text-muted">{line}</p>
              </div>
              <button type="button" disabled={voted[id]} className="shrink-0 text-xs font-semibold text-ember underline-offset-2 hover:underline disabled:text-muted disabled:no-underline" onClick={() => vote(id)}>{voted[id] ? 'Noted' : 'I need this'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
