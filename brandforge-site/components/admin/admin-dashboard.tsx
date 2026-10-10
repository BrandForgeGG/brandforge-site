'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchAuthed } from '@/lib/browser-auth';
import { formatMoney } from '@/lib/peer-contract.js';
import type { PeerView } from '@/lib/peer-contract-view';
import type { AdminChatRow, AdminOverview } from '@/lib/project-db';
import { AdminCalendar } from '@/components/admin/admin-calendar';
import { AdminMembers } from '@/components/admin/admin-members';
import { AdminEmails } from '@/components/admin/admin-emails';

type FunnelEvent = { event: string; count: number; previous: number | null };
type Range = '24h' | '7d' | '30d' | 'all';
type Tab = 'overview' | 'people' | 'money' | 'chats' | 'content';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['people', 'People'], ['money', 'Money'], ['chats', 'Chats'], ['content', 'Content']];
type Overview = AdminOverview & { funnel: { range: Range; window: { since?: string }; events: FunnelEvent[] } | null };


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

const RANGES: [Range, string][] = [['24h', 'Last 24 hours'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']];

// The path a founder walks, in order. Each bar is the share of the first step that got this far, and the
// small percentage is how many of the step before it came on. Everything else is listed below.
const STAGES: [string, string][] = [
  ['landing_viewed', 'Saw the landing page'],
  ['signin_started', 'Started signing in'],
  ['chat_started', 'Started a chat'],
  ['project_described', 'Described a project'],
  ['review_requested', 'Asked for review'],
  ['proposal_received', 'Got a proposal'],
  ['proposal_accepted', 'Accepted one'],
  ['contract_signed', 'Signed the contract'],
  ['funding_verified', 'Funded the escrow'],
  ['payment_released', 'Released a payment'],
];

function Delta({ now, before }: { now: number; before: number | null }) {
  if (before === null) return null;
  if (now === before) return <span className="text-[11px] text-muted">same as before</span>;
  const up = now > before;
  return (
    <span className={`text-[11px] ${up ? 'text-success' : 'text-danger'}`}>
      {up ? '▲' : '▼'} {before === 0 ? 'new' : `${Math.round((Math.abs(now - before) / before) * 100)}%`}
    </span>
  );
}

function FunnelPanel({ funnel, range, onRange }: { funnel: Overview['funnel']; range: Range; onRange: (range: Range) => void }) {
  const events = funnel?.events ?? [];
  const byName = new Map(events.map((e) => [e.event, e]));
  const stages = STAGES.map(([id, label]) => ({ id, label, e: byName.get(id) ?? { event: id, count: 0, previous: null } }));
  const top = Math.max(1, ...stages.map((s) => s.e.count));
  const staged = new Set(STAGES.map(([id]) => id));
  const others = events.filter((e) => !staged.has(e.event) && e.count > 0).sort((a, b) => b.count - a.count);
  return (
    <Section
      title="Funnel"
      action={
        <div role="group" aria-label="Time range" className="flex flex-wrap gap-1">
          {RANGES.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={range === id} onClick={() => onRange(id)} className={`rounded-full border px-2.5 py-1 text-[11px] transition ${range === id ? 'border-ember bg-ember/15 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
      }
    >
      {!funnel ? (
        <p className="text-sm text-muted">No events recorded yet.</p>
      ) : (
        <>
          <ol className="space-y-2">
            {stages.map(({ id, label, e }, i) => {
              const prev = i === 0 ? null : stages[i - 1].e.count;
              return (
                <li key={id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-foreground">{label}</span>
                    <span className="flex items-baseline gap-2">
                      <Delta now={e.count} before={e.previous} />
                      {prev ? <span className="text-[11px] text-muted">{Math.round((e.count / prev) * 100)}% of previous</span> : null}
                      <span className="w-10 text-right tabular-nums text-foreground">{e.count}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-overlay">
                    <div className="h-full rounded-full bg-ember transition-all" style={{ width: `${(e.count / top) * 100}%`, minWidth: e.count ? 4 : 0 }} />
                  </div>
                </li>
              );
            })}
          </ol>
          {others.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted">Everything else people did ({others.length})</summary>
              <table className="mt-2 w-full text-sm">
                <tbody className="divide-y divide-line">
                  {others.map((e) => (
                    <tr key={e.event}>
                      <td className="py-1.5 text-muted">{e.event.replace(/_/g, ' ')}</td>
                      <td className="py-1.5 text-right">
                        <Delta now={e.count} before={e.previous} />
                      </td>
                      <td className="w-12 py-1.5 text-right tabular-nums text-foreground">{e.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </>
      )}
    </Section>
  );
}

export function AdminDashboard() {
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [chats, setChats] = useState<AdminChatRow[]>([]);
  const [contracts, setContracts] = useState<PeerView[]>([]);
  const [range, setRange] = useState<Range>('7d');
  const [tab, setTabState] = useState<Tab>('overview');
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable in the browser
    if (wanted && TABS.some(([id]) => id === wanted)) setTabState(wanted as Tab);
  }, []);
  function setTab(next: Tab) {
    setTabState(next);
    try {
      const url = new URL(window.location.href);
      if (next === 'overview') url.searchParams.delete('tab');
      else url.searchParams.set('tab', next);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* the tab still works without the address */
    }
  }
  const [updated, setUpdated] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [noteOk, setNoteOk] = useState(true);

  const [chatQuery, setChatQuery] = useState('');
  const [showTest, setShowTest] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteAllText, setDeleteAllText] = useState('');


  const load = useCallback(async () => {
    try {
      const res = await fetchAuthed(`/api/admin/overview?range=${range}`);
      if (res.status === 401 || res.status === 403) return setState('denied');
      if (!res.ok) return setState('error');
      setOverview(await res.json());
      setState('ok');
      setUpdated(new Date());
      const [c, k] = await Promise.all([
        fetchAuthed('/api/admin/chats').then((r) => (r.ok ? r.json() : { chats: [] })).catch(() => ({ chats: [] })),
        fetchAuthed('/api/peer-contracts?staff=1').then((r) => (r.ok ? r.json() : { contracts: [] })).catch(() => ({ contracts: [] })),
      ]);
      setChats(c.chats ?? []);
      setContracts(k.contracts ?? []);
    } catch {
      setState('error');
    }
  }, [range]);

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
      setNoteOk(res.ok);
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

      {note ? (
        <p role={noteOk ? 'status' : 'alert'} className={`rounded-xl border px-4 py-2.5 text-sm ${noteOk ? 'border-success/40 bg-success/10 text-foreground' : 'border-danger/40 bg-danger/10 text-danger'}`}>
          {note}
        </p>
      ) : null}

      <div role="tablist" aria-label="Dashboard sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
        {TABS.map(([id, label]) => {
          const badge = id === 'people' ? pendingApps.length : id === 'money' ? contractTodo : 0;
          return (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm transition ${tab === id ? 'border-b-2 border-ember text-foreground' : 'text-muted hover:text-foreground'}`}>
              {label}
              {badge > 0 ? <span className="rounded-full bg-ember px-1.5 text-[10px] font-bold text-background">{badge}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === 'overview' ? (
        <>
      {contractTodo + pendingApps.length > 0 ? (
        <section aria-label="Needs you" className="rounded-2xl border border-ember/40 bg-ember/10 p-4">
          <p className="font-serif text-lg text-foreground">Needs you</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {pendingApps.length > 0 ? (
              <li><button type="button" onClick={() => setTab('people')} className="rounded-full border border-ember/50 bg-background px-3 py-1.5 text-sm text-foreground transition hover:border-ember">{pendingApps.length} specialist application{pendingApps.length === 1 ? '' : 's'} waiting</button></li>
            ) : null}
            {contractTodo > 0 ? (
              <li><button type="button" onClick={() => setTab('money')} className="rounded-full border border-ember/50 bg-background px-3 py-1.5 text-sm text-foreground transition hover:border-ember">{contractTodo} contract action{contractTodo === 1 ? '' : 's'} to do</button></li>
            ) : null}
          </ul>
        </section>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Section title="Last 14 days">
            <DailyChart daily={overview.daily} />
          </Section>
        </div>
        <div className="lg:col-span-2">
          <FunnelPanel funnel={overview.funnel} range={range} onRange={setRange} />
        </div>
      </div>

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

        </>
      ) : null}

      {tab === 'people' ? (
      <div className="space-y-8">
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

      <AdminMembers />
      <AdminEmails />
      </div>
      ) : null}

      {tab === 'money' ? (
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

      ) : null}

      {tab === 'chats' ? (
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

      ) : null}

      {tab === 'content' ? <AdminCalendar /> : null}
    </div>
  );
}
