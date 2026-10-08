'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getSessionUser } from '@/lib/browser-auth';
import { DISCORD_KIND_ENV } from '@/lib/marketing-poster';

type MarketingPost = {
  id: string;
  created_at: string;
  channel: 'discord' | 'telegram' | 'reddit';
  target: string;
  title: string | null;
  body: string;
  url: string | null;
  scheduled_at: string;
  status: 'queued' | 'posted' | 'failed' | 'paused';
  attempts: number;
  posted_at: string | null;
  permalink: string | null;
  error: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  queued: 'border-ember/40 bg-ember/10 text-ember',
  posted: 'border-emerald-500/30 bg-emerald-500/10 text-success',
  failed: 'border-red-500/40 bg-red-500/10 text-danger',
  paused: 'border-line bg-background text-muted',
};

const CHANNEL_OPTIONS = ['discord', 'telegram', 'reddit'] as const;

export default function AdminMarketingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [channel, setChannel] = useState<string>('discord');
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [runNote, setRunNote] = useState('');
  const [discardId, setDiscardId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/marketing');
    if (!response.ok) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    setPosts(data.posts ?? []);
    setCounts(data.counts ?? {});
    setAllowed(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const user = await getSessionUser();
      if (!user) {
        if (!cancelled) router.push('/login');
        return;
      }
      if (!cancelled) await load();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [load, router]);

  async function submit() {
    if (!target.trim() || !body.trim()) {
      setError('Target and body are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          target: target.trim(),
          title: title.trim() || null,
          body: body.trim(),
          url: url.trim() || null,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Failed to queue the post.');
        return;
      }
      setShowForm(false);
      setTarget('');
      setTitle('');
      setBody('');
      setUrl('');
      setScheduledAt('');
      await load();
    } catch {
      setError('Failed to queue the post.');
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setError('');
    setRunNote('');
    try {
      const response = await fetch('/api/admin/marketing/run', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'The queue could not run.');
        return;
      }
      if (data.due === 0) {
        setRunNote('Nothing due yet — posts publish once their scheduled time has arrived.');
      } else {
        setRunNote(
          `Published ${data.posted} · failed ${data.failed}${data.retried ? ` · retrying ${data.retried}` : ''}.`
        );
      }
      await load();
    } catch {
      setError('The queue could not run.');
    } finally {
      setBusy(false);
    }
  }

  async function discard(id: string) {
    setDiscardId(id);
    setError('');
    try {
      const response = await fetch(`/api/admin/marketing/${id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Failed to discard the draft.');
        return;
      }
      await load();
    } catch {
      setError('Failed to discard the draft.');
    } finally {
      setDiscardId(null);
    }
  }

  if (loading) {
    return (
      <AppShell title="Marketing queue" subtitle="Scheduled outbound posts across channels.">
        <p className="text-sm text-muted">Loading…</p>
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell title="Marketing queue" subtitle="Scheduled outbound posts across channels.">
        <div className="max-w-xl rounded-2xl border border-line bg-panel p-6">
          <h2 className="font-serif text-2xl text-foreground">Admins only</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            This page is for BrandForge admins. Sign in with an admin account, or go back to chat.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Marketing queue"
      subtitle="Scheduled outbound posts across channels. Queued rows publish only when the kill switch is on."
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void runNow()}
            disabled={busy}
            className="rounded-xl border border-line px-4 py-2 text-sm text-foreground transition hover:border-ember disabled:opacity-50"
          >
            {busy ? 'Running…' : 'Publish due posts'}
          </button>
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-95"
          >
            {showForm ? 'Close' : 'Queue a post'}
          </button>
        </div>
      }
    >
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {runNote ? (
        <p role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-success">
          {runNote}
        </p>
      ) : null}

      <p className="mb-4 flex flex-wrap gap-3 text-sm text-muted">
        <span className="text-foreground">{counts.queued ?? 0} queued</span>
        <span>{counts.posted ?? 0} posted</span>
        <span>{counts.failed ?? 0} failed</span>
        <span>{counts.paused ?? 0} paused</span>
      </p>

      {showForm ? (
        <section className="mb-6 rounded-2xl border border-line bg-panel p-5">
          <h2 className="text-xs uppercase tracking-[0.2em] text-copper">Queue a post</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="m-channel" className="block text-xs uppercase tracking-[0.15em] text-muted">
                Channel
              </label>
              <select
                id="m-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              >
                {CHANNEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="m-target" className="block text-xs uppercase tracking-[0.15em] text-muted">
                Target (channel name, handle or subreddit)
              </label>
              <input
                id="m-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                list={channel === 'discord' ? 'discord-targets' : undefined}
                placeholder={channel === 'reddit' ? 'r/indiehackers' : 'milestones'}
                className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              />
              <datalist id="discord-targets">
                {channel === 'discord'
                  ? Object.keys(DISCORD_KIND_ENV).map((kind) => <option key={kind} value={kind} />)
                  : null}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="m-title" className="block text-xs uppercase tracking-[0.15em] text-muted">
                Title (optional)
              </label>
              <input
                id="m-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="m-body" className="block text-xs uppercase tracking-[0.15em] text-muted">
                Body
              </label>
              <textarea
                id="m-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              />
            </div>
            <div>
              <label htmlFor="m-url" className="block text-xs uppercase tracking-[0.15em] text-muted">
                Link (optional)
              </label>
              <input
                id="m-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://brandforge.gg"
                className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              />
            </div>
            <div>
              <label htmlFor="m-schedule" className="block text-xs uppercase tracking-[0.15em] text-muted">
                Scheduled at (local time, empty = now)
              </label>
              <input
                id="m-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !target.trim() || !body.trim()}
              className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Queueing…' : 'Queue post'}
            </button>
            <p className="text-xs text-muted">
              Posts stay queued until their scheduled time — then use Publish due posts to send them.
            </p>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-copper">Posts ({posts.length})</h2>
        {posts.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Nothing queued yet. Posts you queue appear here with their delivery status.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {posts.map((post) => (
              <li key={post.id} className="rounded-2xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <span className="rounded-full border border-line bg-background px-3 py-1 text-xs uppercase tracking-[0.15em] text-muted">
                      {post.channel}
                    </span>
                    <span className="font-mono text-xs text-foreground">{post.target}</span>
                    <span className="text-xs text-muted">
                      {post.title ? `${post.title} · ` : ''}
                      {new Date(post.scheduled_at).toLocaleString()}
                    </span>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.15em] ${STATUS_STYLES[post.status] ?? STATUS_STYLES.paused}`}
                  >
                    {post.status}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {post.body.length > 400 ? `${post.body.slice(0, 400)}…` : post.body}
                </p>
                {post.permalink ? (
                  <a
                    href={post.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-ember hover:underline"
                  >
                    View post →
                  </a>
                ) : null}
                {post.error ? (
                  <p className="mt-2 text-xs text-danger">{post.error}</p>
                ) : null}
                {post.status !== 'posted' ? (
                  <button
                    type="button"
                    onClick={() => void discard(post.id)}
                    disabled={discardId === post.id}
                    className="mt-2 text-xs text-danger underline-offset-2 transition hover:underline disabled:opacity-50"
                  >
                    {discardId === post.id ? 'Discarding…' : 'Discard draft'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
