'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { fetchAuthed } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';
import { clearPendingTask, readPendingTask } from '@/components/custom-task-card';
import { BADGE, StageTrack, stageOf, type TaskStatus } from '@/components/work/task-card-view';

type Person = { id: string; name: string };
type Item = {
  chatId: string;
  title: string;
  kind: 'task' | 'project' | 'plan';
  amount: number | null;
  status: string;
  buyer: Person | null;
  specialists: Person[];
  done: number;
  total: number;
  isBuyer: boolean;
  agreementId?: string | null;
  taskTitle?: string | null;
  summary?: string | null;
  projectName?: string | null;
  requirements?: number;
};
type Manager = { name: string; avatarUrl: string | null };

const EXAMPLES = ['AI chatbot for my site', 'Landing page', 'Brand identity', 'Pack of 5 Reels', 'Meta ad campaign'];
const AMOUNTS = [150, 450, 900, 1500];

// Agreement statuses after payment read as task stages on the board.
function taskStage(status: string): TaskStatus {
  if (status === 'active' || status === 'funded') return 'funded';
  if (status === 'completed') return 'delivered';
  return (['open', 'countered', 'accepted', 'funded', 'review', 'delivered'].includes(status) ? status : 'open') as TaskStatus;
}

function Initial({ name, tone = 'bg-overlay text-foreground' }: { name: string; tone?: string }) {
  return <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone}`} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>;
}

// Set up a task: what it is, the details and the budget. It opens its own chat with the task card.
function NewTask({ initial, onClose }: { initial: { title: string; funds: string; details: string } | null; onClose: () => void }) {
  const router = useRouter();
  const { openLogin } = useLogin();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [details, setDetails] = useState(initial?.details ?? '');
  const [funds, setFunds] = useState(initial?.funds ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetchAuthed('/api/tasks/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, details, funds }) }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { chatId?: string; error?: string }) : {};
    if (res?.status === 401) {
      setBusy(false);
      openLogin({ reason: 'signin', next: '/projects' });
      return;
    }
    if (!res?.ok || !data.chatId) {
      setBusy(false);
      setError(data.error || 'Could not send the task. Try again.');
      return;
    }
    clearPendingTask();
    router.push(`/chat?conversationId=${data.chatId}`);
  }

  const field = 'w-full rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:border-ember focus:outline-none';
  const chip = 'rounded-full border border-line px-3 py-1 text-xs font-medium text-foreground transition hover:border-ember';
  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="font-serif text-2xl text-foreground">New task</p>
        <button type="button" onClick={onClose} className="text-sm font-medium text-foreground/70 hover:text-foreground">Close</button>
      </div>
      <input className={`${field} mt-4`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should the team do?" aria-label="Task" maxLength={120} required />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" onClick={() => setTitle(example)} className={`${chip} ${title === example ? 'border-ember bg-ember/10' : ''}`}>{example}</button>
        ))}
      </div>
      <textarea className={`${field} mt-3 resize-none`} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What it should do, what you already have, and when you need it." aria-label="Details" maxLength={4000} required />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative w-36">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-foreground" aria-hidden="true">€</span>
          <input className={`${field} pl-8`} value={funds} onChange={(e) => setFunds(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="Budget" aria-label="Budget in euros" required />
        </div>
        {AMOUNTS.map((n) => (
          <button key={n} type="button" onClick={() => setFunds(String(n))} className={`${chip} ${funds === String(n) ? 'border-ember bg-ember/10' : ''}`}>€{n.toLocaleString('en-US')}</button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-foreground/70">The team accepts it or proposes a price. You fund it once you agree.</p>
        <button type="submit" disabled={busy} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60">{busy ? 'Sending…' : 'Send to the team'}</button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
    </form>
  );
}

// Every project (a chat) with what the AI understood from it, the three people on it, and its tasks on one board. The
// founder is the dedicated project manager on all of them.
export default function ProjectsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [composing, setComposing] = useState(false);
  const [pending, setPending] = useState<{ title: string; funds: string; details: string } | null>(null);

  useEffect(() => {
    const saved = readPendingTask();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a task typed before signing in opens ready to send
      setPending(saved);
      setComposing(true);
    }
    void fetch('/api/project-manager')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Manager | null) => setManager(data?.name ? data : null))
      .catch(() => undefined);
    void fetchAuthed('/api/projects/funded')
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data: { projects?: Item[]; staff?: boolean }) => {
        setItems(data.projects ?? []);
        setIsStaff(Boolean(data.staff));
      })
      .catch(() => setItems([]));
  }, []);

  // One card per chat, its tasks together.
  const groups = new Map<string, Item[]>();
  for (const item of items ?? []) groups.set(item.chatId, [...(groups.get(item.chatId) ?? []), item]);

  return (
    <AppShell title="Projects" subtitle="">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="flex items-center gap-4 rounded-3xl border border-ember/40 bg-ember/10 p-4 sm:p-5">
          {manager?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the founder's profile picture
            <img src={manager.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
          ) : (
            <Initial name={manager?.name ?? 'F'} tone="h-11 w-11 bg-ember text-on-ember text-base" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember">Dedicated project manager</p>
            <p className="text-sm text-foreground"><span className="font-semibold">{manager?.name ? `${manager.name}, BrandForge founder` : 'The BrandForge founder'}</span> leads every funded project with you and your specialists.</p>
          </div>
        </section>

        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-2xl text-foreground">Your projects</h2>
          {composing ? null : <button type="button" onClick={() => setComposing(true)} className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-on-ember transition hover:opacity-90">New task</button>}
        </div>
        {composing ? <NewTask initial={pending} onClose={() => setComposing(false)} /> : null}

        {items === null ? (
          <p className="text-sm text-foreground/70">Loading…</p>
        ) : groups.size === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-foreground/70">No projects yet. Send a task, or start a chat with the team.</p>
        ) : (
          <ul className="space-y-4">
            {[...groups.entries()].map(([chatId, tasks]) => {
              const head = tasks[0];
              const people = [...new Map(tasks.flatMap((task) => task.specialists).map((person) => [person.id, person])).values()];
              return (
                <li key={chatId} className="rounded-3xl border border-line bg-panel p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-serif text-xl text-foreground">{head.projectName || head.title}</p>
                      {head.summary ? (
                        <p className="mt-1 text-sm leading-relaxed text-foreground/80"><span className="mr-1.5 rounded bg-overlay px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground">AI summary</span>{head.summary}</p>
                      ) : null}
                      {head.requirements ? <p className="mt-1 text-xs text-foreground/70">{head.requirements} requirement{head.requirements === 1 ? '' : 's'} captured from the chat</p> : null}
                    </div>
                    <Link href={`/chat?conversationId=${chatId}`} className="shrink-0 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-on-ember transition hover:opacity-90">Open chat</Link>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <div className="flex items-center gap-2 rounded-2xl bg-overlay px-3 py-2">
                      <Initial name={head.buyer?.name ?? 'B'} />
                      <div className="min-w-0"><p className="text-[11px] text-foreground/70">Buyer</p><p className="truncate text-sm font-medium text-foreground">{head.isBuyer ? 'You' : head.buyer?.name ?? 'Buyer'}</p></div>
                    </div>
                    <div className="flex items-center gap-2 rounded-2xl bg-overlay px-3 py-2">
                      <Initial name={people[0]?.name ?? '?'} />
                      <div className="min-w-0"><p className="text-[11px] text-foreground/70">{people.length > 1 ? 'Specialists' : 'Specialist'}</p><p className="truncate text-sm font-medium text-foreground">{people.length ? people.map((p) => p.name).join(', ') : 'Joins on accept'}</p></div>
                    </div>
                    <div className="flex items-center gap-2 rounded-2xl border border-ember/50 bg-ember/10 px-3 py-2">
                      <Initial name={manager?.name ?? 'F'} tone="bg-ember text-on-ember" />
                      <div className="min-w-0"><p className="text-[11px] font-semibold text-ember">Project manager</p><p className="truncate text-sm font-medium text-foreground">{manager?.name ?? 'The founder'}</p></div>
                    </div>
                  </div>

                  {/* The task board: every task in this chat, on the same six stages as its card. */}
                  <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
                    {tasks.map((task, index) => {
                      const stage = task.kind === 'plan' ? null : taskStage(task.status);
                      return (
                        <li key={`${task.agreementId ?? task.kind}-${index}`} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-medium text-foreground">{task.kind === 'plan' ? `${task.title} · monthly` : task.taskTitle || task.title}</p>
                            <span className="flex shrink-0 items-center gap-2">
                              {task.amount ? <span className="text-sm font-semibold text-foreground">€{task.amount.toLocaleString('en-US')}{task.kind === 'plan' ? '/mo' : ''}</span> : null}
                              {stage ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[stage].tone}`}>{BADGE[stage].label}</span> : <span className="rounded-full bg-trust/15 px-2 py-0.5 text-[11px] font-semibold text-success">Active</span>}
                            </span>
                          </div>
                          {stage ? <div className="mt-2"><StageTrack current={stageOf(stage)} /></div> : null}
                        </li>
                      );
                    })}
                  </ul>
                  {isStaff && !head.isBuyer ? <p className="mt-2 text-xs text-foreground/70">Answer each task on its card in the chat.</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
