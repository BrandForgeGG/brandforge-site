'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';

type Status = {
  hasToken: boolean;
  hasPublicKey: boolean;
  applicationId: string | null;
  commandRegistered: boolean | null;
  tokenAccepted: boolean | null;
  inviteUrl: string | null;
  endpointUrl: string;
};

const btn = 'rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember disabled:opacity-50';
const btnPrimary = 'rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90 disabled:opacity-50';

function Row({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-3 py-2 text-sm">
      <span aria-hidden="true" className={ok === true ? 'mt-1 h-2 w-2 shrink-0 rounded-full bg-success' : ok === false ? 'mt-1 h-2 w-2 shrink-0 rounded-full bg-danger' : 'mt-1 h-2 w-2 shrink-0 rounded-full bg-muted'} />
      <span className="min-w-0">
        <span className="text-foreground">{label}</span>
        <span className="sr-only">{ok === true ? ' (done)' : ok === false ? ' (missing)' : ' (unknown)'}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </li>
  );
}

// One place to finish the Discord bot setup: what is done, what is missing, a button that registers
// the command, and the invite link that installs the bot with the right permissions.
export function AdminDiscord() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchAuthed('/api/admin/discord');
      if (res.ok) setStatus(await res.json());
    } catch {
      /* the panel simply stays empty */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void load();
  }, [load]);

  async function register() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetchAuthed('/api/admin/discord', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setNote(res.ok ? 'Registered. It can take a minute to appear in Discord.' : data.error || 'That did not work.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <section className="border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl tracking-[-0.01em] text-foreground">Discord bot</h2>
        <p className="text-xs text-muted">Buttons and popup forms, like the Telegram bot</p>
      </div>
      <ul className="mt-3 max-w-2xl divide-y divide-line">
        <Row ok={status.hasToken && status.tokenAccepted !== false} label="Bot token is set in Vercel" hint={status.hasToken && status.tokenAccepted === false ? 'Discord rejected it. Paste a fresh token from the Bot page.' : 'DISCORD_BOT_TOKEN'} />
        <Row ok={status.hasPublicKey} label="Public key is set in Vercel" hint="DISCORD_PUBLIC_KEY, from General Information in the Developer Portal" />
        <Row ok={status.commandRegistered} label="The /brandforge command is registered" hint={status.commandRegistered === false ? 'Press the button below.' : undefined} />
        <Row ok={null} label="Interactions Endpoint URL is saved in the Developer Portal" hint={status.endpointUrl} />
        <Row ok={null} label="The bot is installed in your server with the commands permission" hint="Use the install link below. Installing again with it is safe." />
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || !status.hasToken} onClick={() => void register()} className={btnPrimary}>
          {status.commandRegistered ? 'Update the command' : 'Register the command'}
        </button>
        {status.inviteUrl ? (
          <>
            <a href={status.inviteUrl} target="_blank" rel="noreferrer" className={btn}>Open install link</a>
            <button
              type="button"
              className={btn}
              onClick={() => {
                void navigator.clipboard?.writeText(status.inviteUrl ?? '').then(() => setCopied(true));
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Copied' : 'Copy install link'}
            </button>
          </>
        ) : null}
        {note ? <span className="text-xs text-muted" role="status">{note}</span> : null}
      </div>
      <p className="mt-3 max-w-2xl text-xs text-muted">
        A Discord bot only shows as online while something keeps a connection open. The website cannot, so run the small presence script on any always-on computer (see runbooks, section 5). Commands work whether or not it is online.
      </p>
    </section>
  );
}
