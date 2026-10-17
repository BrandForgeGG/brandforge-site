'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchAuthed } from '@/lib/browser-auth';
import { getRetainer } from '@/lib/plans.js';

type Client = { userId: string; name: string; plan: string; status: string; via: 'card' | 'crypto'; chatId: string | null; month: number; done: number; active: number; slots: number; lead: string | null; cents: number; team: number; brandforge: number };
type Data = {
  mrr: number;
  teamCents: number;
  software: { pro: number; cents: number };
  split: { team: number; brandforge: number };
  teamShare: number;
  chatsPerClient: number;
  path: { goal: number; mrr: number; gap: number; clients: number; chats: number; progress: number; average: number };
  goalMix: { rows: { plan: string; count: number; cents: number }[]; total: number; team: number; brandforge: number; clients: number };
  plans: { id: string; name: string; cents: number; team: number; brandforge: number }[];
  clients: Client[];
  earnings: { name: string; cents: number; clients: number }[];
  openInvoices: { chatId: string; name: string; plan: string; sentAt: string }[];
  cancelled30d: number;
  invoices30d: { sent: number; paid: number };
};

const eur = (cents: number) => `€${Math.round(cents / 100).toLocaleString('en-US')}`;
const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

// Who does each step from a visitor to a client who stays. "Auto" steps need nobody.
const FLOW: { step: string; what: string; who: 'Team' | 'Auto' | 'Everyone' }[] = [
  { step: 'Come', what: 'Posts, outreach and the site bring buyers to the pricing page.', who: 'Everyone' },
  { step: 'Chat', what: '"Talk to us about Growth" opens a chat. All of us get pinged. First to claim it leads.', who: 'Team' },
  { step: 'Agree', what: 'Answer, shape what they get, then one click: Send the invoice.', who: 'Team' },
  { step: 'Pay', what: 'Card or crypto in the chat. The invoice turns Paid and month 1 starts.', who: 'Auto' },
  { step: 'Work', what: 'The client adds tasks in the chat. Monthly plans run 1 or 2 at a time; one-time tasks run as agreed. A free slot shows red here.', who: 'Team' },
  { step: 'Deliver', what: 'Move each item to review. The client approves in the chat.', who: 'Team' },
  { step: 'Retain', what: 'Renewal starts the next month by itself. A cancel pings all of us.', who: 'Auto' },
];

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-serif text-3xl text-foreground">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

export function TeamDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchAuthed('/api/team/dashboard')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load the dashboard.');
        setData(body as Data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the dashboard.'));
  }, []);

  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const share = Math.round(data.teamShare * 100);
  return (
    <div className="space-y-10">
      {/* The goal */}
      <section aria-label="Monthly revenue" className="rounded-3xl border border-line bg-panel p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Monthly revenue</p>
            <p className="mt-1 font-serif text-5xl text-foreground">
              {eur(data.mrr)} <span className="text-2xl text-muted">/ {eur(data.path.goal)}</span>
            </p>
          </div>
          <p className="text-sm text-muted">{Math.round(data.path.progress * 100)}% of the way</p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-overlay" aria-hidden="true">
          <div className="h-full rounded-full bg-ember transition-all" style={{ width: `${Math.max(2, data.path.progress * 100)}%` }} />
        </div>
        <p className="mt-4 text-base text-foreground">
          {data.path.clients === 0 ? (
            'Goal reached. Next: keep every client for month two.'
          ) : (
            <>
              <strong>{data.path.clients} more team clients</strong> gets us there. At 1 in {data.chatsPerClient} plan chats agreeing, that is about <strong>{data.path.chats} plan chats</strong>.
            </>
          )}
        </p>
        <p className="mt-2 text-sm text-muted">
          The mix: {data.goalMix.rows.map((row) => `${row.count} ${getRetainer(row.plan)?.name}`).join(' + ')} = {eur(data.goalMix.total)} a month. The team earns {eur(data.goalMix.team)}, BrandForge keeps {eur(data.goalMix.brandforge)}.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Team clients" value={String(data.clients.length)} note={data.cancelled30d ? `${data.cancelled30d} cancelled in 30 days` : 'None cancelled in 30 days'} />
        <Stat label="Team earns a month" value={eur(data.split.team)} note={`${share}% of every team plan`} />
        <Stat label="BrandForge keeps a month" value={eur(data.split.brandforge)} note={`${100 - share}% of team plans + Pro`} />
        <Stat label="Invoices, 30 days" value={`${data.invoices30d.paid} / ${data.invoices30d.sent}`} note="paid / sent" />
      </div>

      {/* How a buyer becomes a client who stays */}
      <section aria-label="How it works">
        <h2 className="font-serif text-2xl text-foreground">From visitor to client who stays</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {FLOW.map((item, i) => (
            <li key={item.step} className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ember">{i + 1}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.who === 'Auto' ? 'bg-trust/15 text-success' : 'bg-overlay text-muted'}`}>{item.who}</span>
              </div>
              <p className="mt-2 font-semibold text-foreground">{item.step}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{item.what}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Waiting for payment: follow these up today */}
      <section aria-label="Waiting for payment">
        <h2 className="font-serif text-2xl text-foreground">Waiting for payment</h2>
        {data.openInvoices.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No open invoices. Every agreed plan is paid.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-panel">
            {data.openInvoices.map((invoice) => (
              <li key={invoice.chatId + invoice.sentAt} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-foreground">{invoice.name} · {getRetainer(invoice.plan)?.name ?? invoice.plan}</span>
                <span className="text-muted">sent {ago(invoice.sentAt)}</span>
                <Link href={`/chat?conversationId=${invoice.chatId}`} className="font-semibold text-ember underline-offset-2 hover:underline">Follow up</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Every paying client */}
      <section aria-label="Clients">
        <h2 className="font-serif text-2xl text-foreground">Clients</h2>
        {data.clients.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No team clients yet. The first one starts in a chat.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-panel">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">This month</th>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Team earns</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.clients.map((client) => (
                  <tr key={client.userId + client.plan}>
                    <td className="px-4 py-3 text-foreground">{client.name}{client.status === 'past_due' ? <span className="ml-2 text-xs text-danger">payment failed</span> : null}</td>
                    <td className="px-4 py-3 text-foreground">{getRetainer(client.plan)?.name} <span className="text-muted">{eur(client.cents)}</span></td>
                    <td className="px-4 py-3">
                      {client.month ? (
                        <span className="text-muted">
                          Month {client.month} · {client.done} shipped ·{' '}
                          <span className={client.active < client.slots ? 'font-semibold text-danger' : 'text-foreground'}>{client.active}/{client.slots} in progress</span>
                        </span>
                      ) : <span className="text-muted">Starting</span>}
                    </td>
                    <td className="px-4 py-3 text-foreground">{client.lead ?? <span className="text-danger">Unclaimed</span>}</td>
                    <td className="px-4 py-3 text-foreground">{eur(client.team)}</td>
                    <td className="px-4 py-3 text-right">{client.chatId ? <Link href={`/chat?conversationId=${client.chatId}`} className="font-semibold text-ember underline-offset-2 hover:underline">Open</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* What each lead earns */}
        <section aria-label="Earnings">
          <h2 className="font-serif text-2xl text-foreground">What the team earns</h2>
          <p className="mt-1 text-sm text-muted">Per lead, each month, from the clients they lead. The lead pays whoever they bring into the work from it.</p>
          {data.earnings.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing yet. Claim a plan chat to lead it.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-panel">
              {data.earnings.map((row) => (
                <li key={row.name} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-foreground">{row.name} <span className="text-muted">· {row.clients} {row.clients === 1 ? 'client' : 'clients'}</span></span>
                  <span className="font-semibold text-foreground">{eur(row.cents)}/mo</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The split per plan */}
        <section aria-label="Split per plan">
          <h2 className="font-serif text-2xl text-foreground">The split per plan</h2>
          <p className="mt-1 text-sm text-muted">{share}% to the people who deliver, {100 - share}% to BrandForge (sales, platform, AI, refunds). Proposed: the founder sets it.</p>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-panel">
            {data.plans.map((plan) => (
              <li key={plan.id} className="grid grid-cols-3 gap-2 px-4 py-3 text-sm">
                <span className="text-foreground">{plan.name} {eur(plan.cents)}</span>
                <span className="text-foreground">Team {eur(plan.team)}</span>
                <span className="text-muted">BrandForge {eur(plan.brandforge)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
