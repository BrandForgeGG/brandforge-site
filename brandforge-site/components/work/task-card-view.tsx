'use client';

import { useState } from 'react';

// The task card, as people see it: in a chat (live), and on the homepage (a demo of the same card). One component, so the
// two can never drift apart. It draws the six stages a task goes through and only the moves the viewer can make now.

export type TaskStatus = 'open' | 'countered' | 'accepted' | 'funded' | 'review' | 'delivered';
export type TaskView = { status: TaskStatus; amount: number; counterAmount?: number; counterNote?: string; reviewNote?: string; reviewLink?: string; changesNote?: string; offer?: boolean };
export type TaskAction = 'accept' | 'counter' | 'accept_counter' | 'decline_counter' | 'submit' | 'approve' | 'changes' | 'pay' | 'pay_crypto';

export const WORK_STAGES = ['Request', 'Agreed', 'Paid', 'Working', 'Review', 'Delivered'] as const;

/** Where a task stands on the six stages (the index of the current one). */
export function stageOf(status: TaskStatus): number {
  return { open: 0, countered: 0, accepted: 1, funded: 3, review: 4, delivered: 5 }[status];
}

const euros = (n: number) => `€${n.toLocaleString('en-US')}`;

/** The six stages. With onSelect (the homepage demo) each stage is a button that shows that moment. */
export function StageTrack({ current, onSelect }: { current: number; onSelect?: (index: number) => void }) {
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label="Stages">
      {WORK_STAGES.map((label, index) => {
        const inner = (
          <>
            <span className="block h-1 overflow-hidden rounded-full bg-overlay">
              <span className="bf-engine-progress block h-full rounded-full bg-ember" style={{ width: index <= current ? '100%' : '0%' }} />
            </span>
            <span className={`mt-1.5 block truncate text-left text-[10px] font-semibold ${index === current ? 'text-foreground' : index < current ? 'text-foreground/70' : 'text-foreground/40'}`}>{label}</span>
          </>
        );
        return (
          <li key={label} className="min-w-0" aria-current={index === current ? 'step' : undefined}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(index)} aria-label={`Show the ${label} stage`} className="block w-full rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember">
                {inner}
              </button>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ol>
  );
}

export const BADGE: Record<TaskStatus, { label: string; tone: string }> = {
  open: { label: 'With the team', tone: 'bg-overlay text-foreground' },
  countered: { label: 'Price proposed', tone: 'bg-ember/15 text-ember' },
  accepted: { label: 'Ready to fund', tone: 'bg-ember/15 text-ember' },
  funded: { label: 'In progress', tone: 'bg-trust/15 text-success' },
  review: { label: 'Ready for review', tone: 'bg-ember/15 text-ember' },
  delivered: { label: 'Delivered', tone: 'bg-trust/15 text-success' },
};

const primary = 'flex-1 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60';
const secondary = 'flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-ember disabled:opacity-60';
const field = 'w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-ember focus:outline-none';

export function TaskCardView({
  title,
  task,
  role,
  busy = null,
  error = '',
  cryptoOn = false,
  demo = false,
  onAction,
  onStage,
  stage,
}: {
  title: string;
  task: TaskView;
  role: 'buyer' | 'team';
  busy?: string | null;
  error?: string;
  cryptoOn?: boolean;
  demo?: boolean;
  onAction?: (action: TaskAction, extra?: Record<string, unknown>) => void;
  /** Demo only: the stage shown, and a way to jump to another. */
  onStage?: (index: number) => void;
  stage?: number;
}) {
  const [form, setForm] = useState<null | 'counter' | 'submit' | 'changes'>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const act = (action: TaskAction, extra?: Record<string, unknown>) => {
    if (demo) return;
    onAction?.(action, extra);
    setForm(null);
  };
  const badge = BADGE[task.status];
  const proposed = task.status === 'countered' && task.counterAmount && task.counterAmount !== task.amount;
  const price = task.status === 'countered' && task.counterAmount ? task.counterAmount : task.amount;

  return (
    <div className="w-full overflow-hidden rounded-3xl border border-line bg-panel shadow-[0_24px_60px_-40px_rgba(29,27,24,0.45)]">
      <div className="px-5 pb-1 pt-4">
        <StageTrack current={stage ?? stageOf(task.status)} onSelect={onStage} />
      </div>
      <div className="px-5 pb-5 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/60">{task.offer ? 'Offer from the team' : 'Task'}</p>
            <p className="mt-1 font-serif text-xl leading-tight text-foreground">{title}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.tone}`}>{badge.label}</span>
        </div>
        <p className="mt-2 flex items-baseline gap-2">
          {proposed ? <span className="font-serif text-2xl text-foreground/40 line-through">{euros(task.amount)}</span> : null}
          <span className="font-serif text-3xl text-foreground">{euros(price)}</span>
        </p>
        {task.status === 'countered' && task.counterNote ? <p className="mt-2 rounded-xl bg-overlay px-3 py-2 text-sm text-foreground">{task.counterNote}</p> : null}
        {task.status === 'funded' && task.changesNote ? <p className="mt-2 rounded-xl bg-overlay px-3 py-2 text-sm text-foreground"><span className="font-semibold">Changes asked: </span>{task.changesNote}</p> : null}
        {task.status === 'review' && (task.reviewNote || task.reviewLink) ? (
          <div className="mt-2 rounded-xl bg-overlay px-3 py-2 text-sm text-foreground">
            {task.reviewNote ? <p>{task.reviewNote}</p> : null}
            {task.reviewLink ? <a href={task.reviewLink} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-block font-semibold text-ember underline-offset-2 hover:underline">Open the work <span aria-hidden="true">↗</span></a> : null}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {/* The team */}
          {role === 'team' && task.status === 'open' && form !== 'counter' ? (
            <div className="flex gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => act('accept')} className={primary}>{busy === 'accept' ? 'Accepting…' : `Accept ${euros(task.amount)}`}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => (demo ? undefined : setForm('counter'))} className={secondary}>Propose a price</button>
            </div>
          ) : null}
          {role === 'team' && form === 'counter' ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="€" aria-label="Your price in euros" className={`${field} w-24`} />
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Why, in one line" aria-label="Why" className={`${field} min-w-0 flex-1`} />
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={Boolean(busy) || !amount} onClick={() => act('counter', { amount, note })} className={primary}>{busy === 'counter' ? 'Sending…' : 'Send price'}</button>
                <button type="button" onClick={() => setForm(null)} className={secondary}>Cancel</button>
              </div>
            </div>
          ) : null}
          {role === 'team' && task.status === 'funded' && form !== 'submit' ? (
            <button type="button" disabled={Boolean(busy)} onClick={() => (demo ? undefined : setForm('submit'))} className={`${primary} w-full`}>Send for review</button>
          ) : null}
          {role === 'team' && form === 'submit' ? (
            <div className="space-y-2">
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link to the work" aria-label="Link to the work" className={field} />
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="A note for the buyer" aria-label="A note for the buyer" className={field} />
              <div className="flex gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => act('submit', { link, note })} className={primary}>{busy === 'submit' ? 'Sending…' : 'Send to the buyer'}</button>
                <button type="button" onClick={() => setForm(null)} className={secondary}>Cancel</button>
              </div>
            </div>
          ) : null}
          {role === 'team' && ['countered', 'accepted', 'review'].includes(task.status) ? (
            <p className="text-sm text-foreground/80">{task.status === 'countered' ? 'Your price is with the buyer.' : task.status === 'accepted' ? 'Agreed. Waiting for the buyer to fund it.' : 'With the buyer for review.'}</p>
          ) : null}

          {/* The buyer */}
          {role === 'buyer' && task.status === 'open' ? <p className="text-sm text-foreground/80">Sent. The team accepts it or proposes a price, right here.</p> : null}
          {role === 'buyer' && task.status === 'countered' ? (
            <div className="flex gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => act('accept_counter')} className={primary}>{busy === 'accept_counter' ? 'Accepting…' : `Accept ${euros(price)}`}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => act('decline_counter')} className={secondary}>Decline</button>
            </div>
          ) : null}
          {role === 'buyer' && task.status === 'accepted' ? (
            <>
              <button type="button" disabled={Boolean(busy)} onClick={() => act('pay')} className={`${primary} w-full`}>{busy === 'pay' ? 'Opening payment…' : `Fund ${euros(task.amount)} and start`}</button>
              {cryptoOn ? <button type="button" onClick={() => act('pay_crypto')} className="block w-full text-center text-xs font-medium text-foreground underline-offset-2 hover:underline">or pay with crypto</button> : null}
            </>
          ) : null}
          {role === 'buyer' && task.status === 'funded' ? <p className="text-sm text-foreground/80">Paid. The team is working on it and sends it here for your review.</p> : null}
          {role === 'buyer' && task.status === 'review' && form !== 'changes' ? (
            <div className="flex gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => act('approve')} className={primary}>{busy === 'approve' ? 'Approving…' : 'Approve and release'}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => (demo ? undefined : setForm('changes'))} className={secondary}>Ask for changes</button>
            </div>
          ) : null}
          {role === 'buyer' && form === 'changes' ? (
            <div className="space-y-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What should change?" aria-label="What should change" className={field} />
              <div className="flex gap-2">
                <button type="button" disabled={Boolean(busy) || note.trim().length < 3} onClick={() => act('changes', { note })} className={primary}>{busy === 'changes' ? 'Sending…' : 'Send'}</button>
                <button type="button" onClick={() => setForm(null)} className={secondary}>Cancel</button>
              </div>
            </div>
          ) : null}
          {task.status === 'delivered' ? <p className="flex items-center gap-2 text-sm font-semibold text-success"><span aria-hidden="true">✓</span> Delivered and approved. Funds released to the team.</p> : null}
          {error ? <p role="alert" className="text-center text-xs text-danger">{error}</p> : null}
        </div>
      </div>
      <p className="border-t border-line px-5 py-2.5 text-center text-xs text-foreground/70">Funds held by BrandForge, released when the buyer approves.</p>
    </div>
  );
}
