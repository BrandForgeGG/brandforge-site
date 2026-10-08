'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getSessionUser } from '@/lib/browser-auth';

type Campaign = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  kind: 'directory' | 'launch' | 'outreach' | 'other';
  target_url: string | null;
  category: string | null;
  status: 'planned' | 'in_progress' | 'submitted' | 'live' | 'declined' | 'skipped';
  notes: string | null;
  live_url: string | null;
  submitted_at: string | null;
};

const STATUSES = ['planned', 'in_progress', 'submitted', 'live', 'declined', 'skipped'] as const;
const KINDS = ['directory', 'launch', 'outreach', 'other'] as const;

const STATUS_STYLES: Record<string, string> = {
  planned: 'border-line bg-background text-muted',
  in_progress: 'border-ember/40 bg-ember/10 text-ember',
  submitted: 'border-sky-500/30 bg-sky-500/10 text-foreground',
  live: 'border-emerald-500/30 bg-emerald-500/10 text-success',
  declined: 'border-red-500/40 bg-red-500/10 text-danger',
  skipped: 'border-line bg-background text-muted/60',
};

export default function AdminCampaignsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [migrationNote, setMigrationNote] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('directory');
  const [targetUrl, setTargetUrl] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/campaigns');
    if (response.status === 401) {
      router.push('/login');
      return;
    }
    if (response.status === 403) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAllowed(true);
      setMigrationNote(
        data.pendingMigration
          ? 'Campaigns need migration 0021_marketing_campaigns.sql applied in the Supabase SQL editor first. The table does not exist yet, so the tracker stays empty on purpose.'
          : (data.error || 'Failed to load campaigns.')
      );
      setCampaigns([]);
      setCounts({});
      setLoading(false);
      return;
    }
    setCampaigns(data.campaigns ?? []);
    setCounts(data.counts ?? {});
    setMigrationNote('');
    setAllowed(true);
    setLoading(false);
  }, [router]);

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

  async function create() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          kind,
          targetUrl: targetUrl.trim() || null,
          category: category.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Failed to create the campaign.');
        return;
      }
      setShowForm(false);
      setName('');
      setTargetUrl('');
      setCategory('');
      setNotes('');
      await load();
    } catch {
      setError('Failed to create the campaign.');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(campaign: Campaign, status: string) {
    if (status === campaign.status) return;
    setBusyId(campaign.id);
    setError('');
    try {
      const response = await fetch(`/api/admin/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, previousStatus: campaign.status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Failed to update the campaign.');
        return;
      }
      await load();
    } catch {
      setError('Failed to update the campaign.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <AppShell title="Campaigns" subtitle="Directory submissions, launches and outreach.">
        <p className="text-sm text-muted">Loading…</p>
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell title="Campaigns" subtitle="Directory submissions, launches and outreach.">
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
      title="Campaigns"
      subtitle="Directory submissions, launches and outreach — one row per target, tracked to live."
      actions={
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-95"
        >
          {showForm ? 'Close' : 'Add campaign'}
        </button>
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

      {migrationNote ? (
        <div className="mb-6 max-w-2xl rounded-2xl border border-line bg-panel p-5">
          <p className="text-sm leading-relaxed text-muted">{migrationNote}</p>
        </div>
      ) : null}

      {!migrationNote && campaigns.length > 0 ? (
        <p className="mb-4 flex flex-wrap gap-3 text-sm text-muted">
          {STATUSES.map((status) => (
            <span key={status}>
              <span className="text-foreground">{counts[status] ?? 0}</span> {status.replace('_', ' ')}
            </span>
          ))}
        </p>
      ) : null}

      {showForm ? (
        <section className="mb-6 rounded-2xl border border-line bg-panel p-5">
          <h2 className="text-xs uppercase tracking-[0.2em] text-copper">Add a campaign</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="c-name" className="block text-xs uppercase tracking-[0.15em] text-muted">
                Name
              </label>
              <input
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product Hunt"
                className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              />
            </div>
            <div>
              <label htmlFor="c-kind" className="block text-xs uppercase tracking-[0.15em] text-muted">
                Kind
              </label>
              <select
                id="c-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              >
                {KINDS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="c-url" className="block text-xs uppercase tracking-[0.15em] text-muted">
                Submit URL (optional)
              </label>
              <input
                id="c-url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://…"
                className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              />
            </div>
            <div>
              <label htmlFor="c-category" className="block text-xs uppercase tracking-[0.15em] text-muted">
                Category (optional)
              </label>
              <input
                id="c-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="dev tools"
                className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="c-notes" className="block text-xs uppercase tracking-[0.15em] text-muted">
                Notes (optional)
              </label>
              <textarea
                id="c-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void create()}
            disabled={saving || !name.trim()}
            className="mt-4 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add campaign'}
          </button>
        </section>
      ) : null}

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-copper">All campaigns ({campaigns.length})</h2>
        {campaigns.length === 0 && !migrationNote ? (
          <p className="mt-3 text-sm text-muted">
            No campaigns yet. Add every directory and launch target you plan to submit to, then move
            each row through its status as submissions go out.
          </p>
        ) : null}
        {campaigns.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="rounded-2xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <span className="font-serif text-lg text-foreground">{campaign.name}</span>
                    <span className="rounded-full border border-line bg-background px-3 py-1 text-xs uppercase tracking-[0.15em] text-muted">
                      {campaign.kind}
                    </span>
                    {campaign.category ? (
                      <span className="text-xs text-muted">{campaign.category}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor={`status-${campaign.id}`} className="sr-only">
                      Status for {campaign.name}
                    </label>
                    <select
                      id={`status-${campaign.id}`}
                      value={campaign.status}
                      disabled={busyId === campaign.id}
                      onChange={(e) => void setStatus(campaign, e.target.value)}
                      className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.15em] outline-none ${STATUS_STYLES[campaign.status] ?? STATUS_STYLES.planned} disabled:opacity-50`}
                    >
                      {STATUSES.map((option) => (
                        <option key={option} value={option} className="bg-background text-foreground">
                          {option.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                  {campaign.target_url ? (
                    <a href={campaign.target_url} target="_blank" rel="noreferrer" className="text-ember hover:underline">
                      Submit page →
                    </a>
                  ) : null}
                  {campaign.live_url ? (
                    <a href={campaign.live_url} target="_blank" rel="noreferrer" className="text-success hover:underline">
                      Live →
                    </a>
                  ) : null}
                  {campaign.submitted_at ? (
                    <span>submitted {new Date(campaign.submitted_at).toLocaleDateString()}</span>
                  ) : null}
                </div>

                {campaign.notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{campaign.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </AppShell>
  );
}
