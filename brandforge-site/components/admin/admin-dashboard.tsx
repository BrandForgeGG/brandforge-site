'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchAuthed } from '@/lib/browser-auth';
import { formatMoney } from '@/lib/peer-contract.js';
import type { PeerView } from '@/lib/peer-contract-view';
import type { AdminChatRow, AdminOverview } from '@/lib/project-db';
import { AdminAi } from '@/components/admin/admin-ai';
import { AdminDiscord } from '@/components/admin/admin-discord';

type Overview = AdminOverview & { funnel: { window: { since?: string }; events: { event: string; count: number }[] } | null };
type MarketingPost = { id: string; channel: string; target: string; title: string | null; body: string; scheduled_at: string; status: string; error: string | null; permalink: string | null };
type Campaign = { id: string; name: string; kind: string; status: string; target_url: string | null; category: string | null; live_url: string | null };

const CAMPAIGN_STATUSES = ['planned', 'in_progress', 'submitted', 'live', 'declined', 'skipped'];

function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

const btn = 'rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember disabled:opacity-50';
const btnPrimary = 'rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90 disabled:opacity-50';

function Section({ title, note, children, action }: { title: string; note?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl tracking-[-0.01em] text-foreground">{title}</h2>
        <div className="flex items-center gap-3">
          {note ? <p className="text-xs text-muted">{note}</p> : null}
          {action}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Kpi({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <div>
      <p className="font-serif text-3xl tabular-nums tracking-[-0.02em] text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

// Two series over 14 days. One accent colour for chats, the foreground for members; values are
// readable from the labels, not only from bar height.
function DailyChart({ daily }: { daily: Overview['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => Math.max(d.chats, d.members)));
  return (
    <div role="img" aria-label={`Real chats and new members per day over the last 14 days. Busiest day ${max}.`}>
      <div className="flex h-28 items-end gap-1.5">
        {daily.map((d) => (
          <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-px" title={`${d.day}: ${d.chats} chats, ${d.members} new members`}>
            <div className="w-full rounded-sm bg-foreground/70" style={{ height: `${(d.members / max) * 100}%`, minHeight: d.members ? 2 : 0 }} />
            <div className="w-full rounded-sm bg-ember" style={{ height: `${(d.chats / max) * 100}%`, minHeight: d.chats ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted">
        <span>{daily[0]?.day.slice(5)}</span>
        <span>{daily[daily.length - 1]?.day.slice(5)}</span>
      </div>
      <p className="mt-2 flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ember" />Chats started</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-foreground/70" />New members</span>
      </p>
    </div>
  );
}

export function AdminDashboard() {
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [chats, setChats] = useState<AdminChatRow[]>([]);
  const [contracts, setContracts] = useState<PeerView[]>([]);
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [chatQuery, setChatQuery] = useState('');
  const [showTest, setShowTest] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteAllText, setDeleteAllText] = useState('');

  const [mChannel, setMChannel] = useState('discord');
  const [mTarget, setMTarget] = useState('');
  const [mBody, setMBody] = useState('');

  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [invSpecialty, setInvSpecialty] = useState('');
  const [invNote, setInvNote] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetchAuthed('/api/admin/overview');
      if (res.status === 401 || res.status === 403) return setState('denied');
      if (!res.ok) return setState('error');
      setOverview(await res.json());
      setState('ok');
      setUpdated(new Date());
      const [c, k, m, g] = await Promise.all([
        fetchAuthed('/api/admin/chats').then((r) => (r.ok ? r.json() : { chats: [] })).catch(() => ({ chats: [] })),
        fetchAuthed('/api/peer-contracts?staff=1').then((r) => (r.ok ? r.json() : { contracts: [] })).catch(() => ({ contracts: [] })),
        fetchAuthed('/api/admin/marketing').then((r) => (r.ok ? r.json() : { posts: [] })).catch(() => ({ posts: [] })),
        fetchAuthed('/api/admin/campaigns').then((r) => (r.ok ? r.json() : { campaigns: [] })).catch(() => ({ campaigns: [] })),
      ]);
      setChats(c.chats ?? []);
      setContracts(k.contracts ?? []);
      setPosts(m.posts ?? []);
      setCampaigns(g.campaigns ?? []);
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount, then every 30s
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function run(label: string, request: () => Promise<Response>) {
    setBusy(true);
    setNote(null);
    try {
      const res = await request();
      const data = await res.json().catch(() => ({}));
      setNote(res.ok ? label : data.error || 'That did not work.');
      await load();
      return res.ok ? data : null;
    } finally {
      setBusy(false);
    }
  }

  const json = { 'Content-Type': 'application/json' };
  const visibleChats = useMemo(
    () =>
      chats
        .filter((c) => showTest || !c.isTest)
        .filter((c) => !chatQuery.trim() || `${c.title} ${c.ownerName} ${c.ownerEmail ?? ''}`.toLowerCase().includes(chatQuery.trim().toLowerCase())),
    [chats, showTest, chatQuery],
  );

  if (state === 'loading') return <p className="text-sm text-muted">Loading the dashboard…</p>;
  if (state === 'denied') return <p className="text-sm text-muted">Admins only. <Link href="/" className="text-ember underline-offset-2 hover:underline">Back to chat</Link></p>;
  if (state === 'error' || !overview) return <p className="text-sm text-muted">The dashboard could not load. <button type="button" className="text-ember underline-offset-2 hover:underline" onClick={() => void load()}>Try again</button></p>;

  const deposits = contracts.filter((c) => c.fundingStatus === 'verifying');
  const disputes = contracts.flatMap((c) => c.milestones.map((m, index) => ({ c, m, index })).filter(({ m }) => m.status === 'disputed'));
  const payouts = contracts.flatMap((c) => c.payoutsDue.map((p) => ({ c, p })));
  const contractTodo = deposits.length + disputes.length + payouts.length;
  const pendingApps = overview.applications.filter((a) => a.status === 'pending' && !a.isTest);
  const realApps = overview.applications.filter((a) => !a.isTest);
  const eventsShown = (overview.funnel?.events ?? []).filter((e) => e.count > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-muted">
          <span className="bf-status-dot" aria-hidden="true" />
          Live. Real users only: staff and test accounts are left out.
          {updated ? <span>Updated {updated.toLocaleTimeString()}</span> : null}
        </p>
        <div className="flex items-center gap-2">
          {note ? <span className="text-xs text-muted" role="status">{note}</span> : null}
          <button type="button" onClick={() => void load()} className={btn}>Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi value={overview.totals.members} label="Members" hint={`${overview.today.members} today`} />
        <Kpi value={overview.chats.total} label="Chats" hint={`${overview.today.chats} today · ${overview.chats.guests} guest`} />
        <Kpi value={overview.openListings} label="Open listings" hint={`${overview.week.listings} this week`} />
        <Kpi value={pendingApps.length} label="Applications waiting" />
        <Kpi value={contractTodo} label="Contract actions" hint={`${overview.totals.contractsSigned} signed all time`} />
        <Kpi value={overview.totals.milestonesReleased} label="Milestones released" />
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Section title="Last 14 days">
            <DailyChart daily={overview.daily} />
          </Section>
        </div>
        <div className="lg:col-span-2">
          <Section title="Funnel" note={overview.funnel?.window?.since ? `since ${new Date(overview.funnel.window.since).toLocaleDateString()}` : undefined}>
            {eventsShown.length === 0 ? <p className="text-sm text-muted">No events recorded yet.</p> : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {eventsShown.map((e) => (
                    <tr key={e.event}>
                      <td className="py-1.5 text-muted">{e.event.replace(/_/g, ' ')}</td>
                      <td className="py-1.5 text-right tabular-nums text-foreground">{e.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>
      </div>

      <AdminAi />

      <AdminDiscord />

      <Section title="Happening now" note="The latest real activity">
        {overview.activity.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
          <ul className="divide-y divide-line">
            {overview.activity.map((item, i) => (
              <li key={`${item.at}-${i}`} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <span className="min-w-0 truncate text-foreground">{item.text}</span>
                <span className="shrink-0 text-xs text-muted">{ago(item.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Invite a specialist" note="They get an email with sign-in steps. Access switches on when they sign in.">
        <form
          className="grid max-w-2xl gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run('Invitation sent.', () => fetchAuthed('/api/admin/invitations', { method: 'POST', headers: json, body: JSON.stringify({ email: invEmail, name: invName, specialty: invSpecialty, note: invNote }) })).then((ok) => {
              if (ok) { setInvEmail(''); setInvName(''); setInvSpecialty(''); setInvNote(''); }
            });
          }}
        >
          <input type="email" required value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="Email address" aria-label="Specialist email" className="rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted" />
          <input value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Name (optional)" aria-label="Specialist name" className="rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted" />
          <input value={invSpecialty} onChange={(e) => setInvSpecialty(e.target.value)} placeholder="Specialty (optional)" aria-label="Specialty" className="rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted" />
          <input value={invNote} onChange={(e) => setInvNote(e.target.value)} placeholder="Personal note in the email (optional)" aria-label="Note" maxLength={300} className="rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted" />
          <div className="sm:col-span-2"><button type="submit" disabled={busy || !invEmail.trim()} className={btnPrimary}>Send invitation</button></div>
        </form>
      </Section>

      <Section title="Specialist applications" note={`${pendingApps.length} waiting · ${realApps.length} total`}>
        {realApps.length === 0 ? <p className="text-sm text-muted">No applications yet.</p> : (
          <ul className="divide-y divide-line">
            {realApps.map((app) => (
              <li key={app.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      {app.full_name || app.email} <span className="text-muted">· {app.specialty || 'specialty not given'} · {app.user_id ? 'has an account' : 'no account yet'}</span>
                    </p>
                    <p className="text-xs text-muted">{app.email} · {ago(app.created_at)}{app.links ? ` · ${app.links}` : ''}</p>
                    <p className="mt-1.5 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-muted">{app.message}</p>
                  </div>
                  {app.status === 'pending' ? (
                    <div className="flex shrink-0 gap-2">
                      <button type="button" disabled={busy} className={btnPrimary} onClick={() => void run('Accepted.', () => fetchAuthed(`/api/admin/applications/${app.id}`, { method: 'POST', headers: json, body: JSON.stringify({ action: 'accept' }) }))}>Accept</button>
                      <button type="button" disabled={busy} className={btn} onClick={() => void run('Declined.', () => fetchAuthed(`/api/admin/applications/${app.id}`, { method: 'POST', headers: json, body: JSON.stringify({ action: 'decline' }) }))}>Decline</button>
                    </div>
                  ) : (
                    <span className="shrink-0 text-xs text-muted">{app.status}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Contracts" note={contractTodo === 0 ? 'Nothing to do' : `${contractTodo} to do`}>
        {contractTodo === 0 ? <p className="text-sm text-muted">No deposits to check, disputes to decide or payouts to send.</p> : (
          <ul className="divide-y divide-line">
            {deposits.map((c) => (
              <li key={`d-${c.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span><span className="text-foreground">Check deposit:</span> <span className="text-muted">{c.title}, {c.payer.name} funds {c.totalLabel}. Reference {c.fundingTx}</span></span>
                <span className="flex gap-2">
                  <button type="button" disabled={busy} className={btnPrimary} onClick={() => void run('Marked funded.', () => fetchAuthed(`/api/peer-contracts/${c.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ action: 'verify_funding', approve: true }) }))}>Mark funded</button>
                  <button type="button" disabled={busy} className={btn} onClick={() => void run('Rejected.', () => fetchAuthed(`/api/peer-contracts/${c.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ action: 'verify_funding', approve: false }) }))}>Reject</button>
                </span>
              </li>
            ))}
            {disputes.map(({ c, m, index }) => (
              <li key={`x-${c.id}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span><span className="text-foreground">Decide dispute:</span> <span className="text-muted">{c.title}, {m.title} ({formatMoney(m.amountCents, c.currency)}). {m.note}</span></span>
                <span className="flex gap-2">
                  <button type="button" disabled={busy} className={btnPrimary} onClick={() => void run('Released.', () => fetchAuthed(`/api/peer-contracts/${c.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ action: 'resolve_dispute', index, outcome: 'release' }) }))}>Release to {c.payee.name}</button>
                  <button type="button" disabled={busy} className={btn} onClick={() => void run('Refunded.', () => fetchAuthed(`/api/peer-contracts/${c.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ action: 'resolve_dispute', index, outcome: 'refund' }) }))}>Refund {c.payer.name}</button>
                </span>
              </li>
            ))}
            {payouts.map(({ c, p }) => (
              <li key={`p-${c.id}-${p.index}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span><span className="text-foreground">{p.kind === 'payout' ? 'Send payout' : 'Send refund'}:</span> <span className="text-muted">{formatMoney(p.amountCents, c.currency)} to {(p.toSide === 'payee' ? c.payee : c.payer).name}, {c.title}</span></span>
                <button type="button" disabled={busy} className={btnPrimary} onClick={() => void run('Recorded.', () => fetchAuthed(`/api/peer-contracts/${c.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ action: 'mark_paid', index: p.index }) }))}>Mark as paid</button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Chats"
        note={`${overview.chats.total} real · ${overview.chats.test} test or staff · ${overview.chats.withMoney} with money committed`}
        action={
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} />
            Show test and staff
          </label>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <input value={chatQuery} onChange={(e) => setChatQuery(e.target.value)} placeholder="Search title, name or email" aria-label="Search chats" className="w-64 rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted" />
          <button type="button" disabled={busy || selected.size === 0} className={btn} onClick={() => {
            if (!window.confirm(`Delete ${selected.size} chat${selected.size === 1 ? '' : 's'} and everything in them? This cannot be undone.`)) return;
            void run('Deleted.', () => fetchAuthed('/api/admin/chats', { method: 'DELETE', headers: json, body: JSON.stringify({ ids: [...selected] }) })).then(() => setSelected(new Set()));
          }}>Delete selected ({selected.size})</button>
          <button type="button" disabled={busy || overview.chats.test === 0} className={btn} onClick={() => {
            if (!window.confirm(`Delete all ${overview.chats.test} test and staff chats? Chats with money committed are kept.`)) return;
            void run('Test chats deleted.', () => fetchAuthed('/api/admin/chats', { method: 'DELETE', headers: json, body: JSON.stringify({ mode: 'test' }) }));
          }}>Delete all test chats</button>
        </div>

        <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-panel text-xs text-muted">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Select all shown" checked={visibleChats.length > 0 && visibleChats.every((c) => selected.has(c.id))} onChange={(e) => setSelected(e.target.checked ? new Set(visibleChats.map((c) => c.id)) : new Set())} /></th>
                <th className="px-3 py-2 font-normal">Chat</th>
                <th className="hidden px-3 py-2 font-normal sm:table-cell">Owner</th>
                <th className="hidden px-3 py-2 font-normal md:table-cell">Status</th>
                <th className="px-3 py-2 font-normal">Started</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleChats.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${c.title}`} checked={selected.has(c.id)} onChange={(e) => { const next = new Set(selected); if (e.target.checked) next.add(c.id); else next.delete(c.id); setSelected(next); }} /></td>
                  <td className="max-w-[16rem] truncate px-3 py-2"><Link href={`/chat?conversationId=${c.id}`} className="text-foreground hover:underline">{c.title}</Link>{c.isTest ? <span className="ml-2 text-xs text-muted">test</span> : null}{c.hasMoney ? <span className="ml-2 text-xs text-ember">money</span> : null}</td>
                  <td className="hidden px-3 py-2 text-muted sm:table-cell">{c.ownerName}</td>
                  <td className="hidden px-3 py-2 text-muted md:table-cell">{c.status.toLowerCase().replace(/_/g, ' ')}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{ago(c.createdAt)}</td>
                  <td className="px-3 py-2 text-right"><button type="button" disabled={busy} className="text-xs text-muted hover:text-danger" onClick={() => {
                    if (!window.confirm(`Delete "${c.title}" and everything in it? This cannot be undone.${c.hasMoney ? ' Money is committed on this chat.' : ''}`)) return;
                    void run('Deleted.', () => fetchAuthed('/api/admin/chats', { method: 'DELETE', headers: json, body: JSON.stringify({ ids: [c.id] }) }));
                  }}>Delete</button></td>
                </tr>
              ))}
              {visibleChats.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-muted">No chats match.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Delete every chat (chats with money committed stay):</span>
          <input value={deleteAllText} onChange={(e) => setDeleteAllText(e.target.value)} placeholder="Type DELETE ALL CHATS" aria-label="Type DELETE ALL CHATS to enable" className="w-56 rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted" />
          <button type="button" disabled={busy || deleteAllText !== 'DELETE ALL CHATS'} className={btn} onClick={() => void run('All chats deleted.', () => fetchAuthed('/api/admin/chats', { method: 'DELETE', headers: json, body: JSON.stringify({ mode: 'all', confirm: deleteAllText }) })).then(() => setDeleteAllText(''))}>Delete all chats</button>
        </div>
      </Section>

      <Section
        title="Outbound posts"
        note={`${posts.filter((p) => p.status === 'queued').length} queued · ${posts.filter((p) => p.status === 'posted').length} posted · ${posts.filter((p) => p.status === 'failed').length} failed`}
        action={<button type="button" disabled={busy} className={btn} onClick={() => void run('Publishing run finished.', () => fetchAuthed('/api/admin/marketing/run', { method: 'POST' }))}>Publish due posts</button>}
      >
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run('Queued.', () => fetchAuthed('/api/admin/marketing', { method: 'POST', headers: json, body: JSON.stringify({ channel: mChannel, target: mTarget, body: mBody }) })).then((ok) => { if (ok) { setMBody(''); } });
          }}
        >
          <select value={mChannel} onChange={(e) => setMChannel(e.target.value)} aria-label="Channel" className="rounded-lg border border-line bg-background px-2 py-1.5 text-sm text-foreground">
            <option>discord</option><option>telegram</option><option>reddit</option>
          </select>
          <input value={mTarget} onChange={(e) => setMTarget(e.target.value)} placeholder="Channel name" aria-label="Target" className="w-40 rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted" />
          <input value={mBody} onChange={(e) => setMBody(e.target.value)} placeholder="Post text" aria-label="Post text" className="min-w-[14rem] flex-1 rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted" />
          <button type="submit" disabled={busy || !mTarget.trim() || mBody.trim().length < 3} className={btnPrimary}>Queue post</button>
        </form>
        <ul className="mt-3 divide-y divide-line">
          {posts.slice(0, 12).map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate"><span className="text-foreground">{p.channel} · {p.target}</span> <span className="text-muted">{p.title || p.body.slice(0, 80)}</span></span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
                <span className={p.status === 'failed' ? 'text-danger' : ''}>{p.status}</span>
                {p.status === 'queued' || p.status === 'failed' ? <button type="button" disabled={busy} className="hover:text-danger" onClick={() => void run('Discarded.', () => fetchAuthed(`/api/admin/marketing/${p.id}`, { method: 'DELETE' }))}>Discard</button> : null}
              </span>
            </li>
          ))}
          {posts.length === 0 ? <li className="py-2 text-sm text-muted">Nothing queued.</li> : null}
        </ul>
      </Section>

      <Section title="Distribution campaigns" note={`${campaigns.filter((c) => c.status === 'live').length} live of ${campaigns.length}`}>
        {campaigns.length === 0 ? <p className="text-sm text-muted">No campaigns tracked yet.</p> : (
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {campaigns.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm">
                <span className="min-w-0 truncate text-foreground">{c.name}</span>
                <select
                  value={c.status}
                  aria-label={`Status of ${c.name}`}
                  disabled={busy}
                  onChange={(e) => void run('Saved.', () => fetchAuthed(`/api/admin/campaigns/${c.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ status: e.target.value, previousStatus: c.status }) }))}
                  className="rounded-md border border-line bg-background px-1.5 py-1 text-xs text-foreground"
                >
                  {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
