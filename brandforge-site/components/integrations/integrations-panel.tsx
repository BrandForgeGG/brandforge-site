'use client';

import { useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';
import { ServiceTile, SERVICES, RANK, type ServiceId } from '@/components/integrations/brand-icons';
import { ChannelLinkForm } from '@/components/integrations/channel-link-form';
import { useChannels, type ChannelKind } from '@/components/integrations/use-channels';
import { donateUrl, lockedReason } from '@/lib/locked-channels.js';

// Platforms that approve BrandForge on their own page: switching one on goes straight there.
const OAUTH_START: Partial<Record<ChannelKind, string>> = {
  instagram: '/api/integrations/meta/start',
  facebook: '/api/integrations/meta/start',
  threads: '/api/integrations/threads/start',
  tumblr: '/api/integrations/tumblr/start',
  linkedin: '/api/integrations/oauth/linkedin/start',
  x: '/api/integrations/oauth/x/start',
  youtube: '/api/integrations/oauth/youtube/start',
};

const SOON: ServiceId[] = ['tiktok'];

export function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'bg-success' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} aria-hidden="true" />
    </button>
  );
}

// Every place BrandForge can post for you, most used first: icon, name, one switch.
export function IntegrationsPanel() {
  const { channels, telegramLinked, tumblrReady, oauthReady, loading, reload, unlink } = useChannels();
  const [open, setOpen] = useState<ChannelKind | 'alerts' | null>(null);
  const [code, setCode] = useState<{ code: string; botUrl: string } | null>(null);
  const [alertError, setAlertError] = useState('');

  const ready = (kind: ChannelKind) => (kind === 'tumblr' ? tumblrReady : OAUTH_START[kind] ? Boolean(oauthReady[kind]) : true);

  async function startAlerts() {
    setOpen('alerts');
    setAlertError('');
    const response = await fetchAuthed('/api/identity/telegram-link', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) return setAlertError(data.error || 'Could not start. Try again.');
    setCode({ code: data.code ?? '', botUrl: data.botUrl ?? '' });
  }

  async function turnOn(kind: ChannelKind) {
    const start = OAUTH_START[kind];
    if (start) window.location.assign(start);
    else setOpen(open === kind ? null : kind);
  }

  async function turnOff(kind: ChannelKind) {
    if (!window.confirm(`Disconnect ${SERVICES[kind].name}?`)) return;
    for (const c of channels.filter((c) => c.kind === kind)) await unlink(c.id);
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {RANK.map((id) => {
        if (SOON.includes(id)) {
          return (
            <li key={id} className="flex items-center gap-3 px-3 py-2.5">
              <ServiceTile id={id} on={false} size={32} />
              <span className="min-w-0 flex-1 text-sm text-muted">{SERVICES[id].name}</span>
              <span className="text-[11px] text-muted">Soon</span>
              <Switch on={false} disabled label={SERVICES[id].name} onChange={() => undefined} />
            </li>
          );
        }
        const kind = id as ChannelKind;
        const mine = channels.filter((c) => c.kind === kind);
        const on = mine.length > 0;
        const locked = lockedReason(kind);
        const unavailable = !ready(kind) && !on;
        return (
          <li key={kind}>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <ServiceTile id={kind} on={on && !locked} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{SERVICES[kind].name}</p>
                {on ? <p className="truncate text-xs text-muted">{mine.map((c) => c.label).join(', ')}</p> : null}
              </div>
              {locked ? (
                <a href={donateUrl()} target="_blank" rel="noopener noreferrer" title={locked} className="text-[11px] text-ember underline-offset-2 hover:underline">Paused</a>
              ) : unavailable ? (
                <span className="text-[11px] text-muted">Soon</span>
              ) : on && !OAUTH_START[kind] ? (
                <button type="button" onClick={() => setOpen(open === kind ? null : kind)} className="text-[11px] text-muted underline-offset-2 hover:text-foreground hover:underline">Add</button>
              ) : null}
              <Switch
                on={on || open === kind}
                disabled={loading || Boolean(locked) || unavailable}
                label={SERVICES[kind].name}
                onChange={(next) => (next ? void turnOn(kind) : on ? void turnOff(kind) : setOpen(null))}
              />
            </div>
            {open === kind ? (
              <div className="border-t border-line bg-overlay/40 px-3 py-3">
                <ChannelLinkForm kind={kind} telegramLinked={telegramLinked} onLinked={() => { setOpen(null); void reload(); }} />
              </div>
            ) : null}
            {kind === 'telegram' ? (
              <div className="border-t border-line">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <ServiceTile id="telegram" on={telegramLinked} size={32} />
                  <span className="min-w-0 flex-1 text-sm font-medium text-foreground">Telegram alerts</span>
                  <Switch on={telegramLinked || open === 'alerts'} disabled={loading || telegramLinked} label="Telegram alerts" onChange={(next) => (next ? void startAlerts() : setOpen(null))} />
                </div>
                {open === 'alerts' && !telegramLinked ? (
                  <div className="flex flex-wrap items-center gap-3 border-t border-line bg-overlay/40 px-3 py-3 text-xs">
                    {alertError ? <span role="alert" className="text-danger">{alertError}</span> : code ? (
                      <>
                        <span className="text-muted">Send</span>
                        <code className="select-all font-mono text-sm font-bold tracking-[0.2em] text-foreground">{code.code}</code>
                        {code.botUrl ? <a href={code.botUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-ember underline-offset-2 hover:underline">to the bot</a> : <span className="text-muted">to @brandforge_bot</span>}
                        <button type="button" className="ml-auto text-muted underline-offset-2 hover:text-foreground hover:underline" onClick={() => void reload()}>Done</button>
                      </>
                    ) : <span className="text-muted">Starting…</span>}
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
