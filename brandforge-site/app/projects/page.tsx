'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { fetchAuthed } from '@/lib/browser-auth';
import { useLogin } from '@/components/login-dialog';

type Person = { id: string; name: string };
type Project = { chatId: string; title: string; kind: 'task' | 'project' | 'plan'; amount: number | null; currency: string; status: string; buyer: Person | null; specialists: Person[]; done: number; total: number; isBuyer: boolean };
type Manager = { name: string; avatarUrl: string | null };

const KIND: Record<Project['kind'], string> = { task: 'Task', project: 'Project', plan: 'Team plan' };

// Where each piece of work stands, and what the viewer does next.
const STAGE: Record<string, { label: string; tone: string; buyer: string; team: string }> = {
  open: { label: 'With the team', tone: 'bg-overlay text-foreground', buyer: 'Open', team: 'Accept or counter' },
  countered: { label: 'Counter offer', tone: 'bg-ember/15 text-ember', buyer: 'Answer', team: 'Open' },
  accepted: { label: 'Ready to fund', tone: 'bg-ember/15 text-ember', buyer: 'Fund', team: 'Open' },
  funded: { label: 'Funded', tone: 'bg-trust/15 text-success', buyer: 'Open', team: 'Open' },
  active: { label: 'In progress', tone: 'bg-trust/15 text-success', buyer: 'Open', team: 'Open' },
  completed: { label: 'Done', tone: 'bg-overlay text-foreground', buyer: 'Open', team: 'Open' },
};

const EXAMPLES = ['AI chatbot for my site', 'Landing page', 'Brand identity', 'Pack of 5 Reels', 'Meta ad campaign'];
const AMOUNTS = [150, 450, 900, 1500];
const STEPS = ['Send the task and the funds you have in mind', 'The team accepts it, or counters with a price', 'Fund it: BrandForge holds the money', 'Work starts with your project manager'];

function Initial({ name, tone = 'bg-overlay text-foreground' }: { name: string; tone?: string }) {
  return <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone}`} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>;
}

// Set up a custom task: what it is and the funds for it. It opens its own chat, where the team accepts or counters.
function NewTask() {
  const router = useRouter();
  const { openLogin } = useLogin();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [funds, setFunds] = useState('');
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
    router.push(`/chat?conversationId=${data.chatId}`);
  }

  const field = 'w-full rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:border-ember focus:outline-none';
  const chip = 'rounded-full border border-line px-3 py-1 text-xs font-medium text-foreground transition hover:border-ember';
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-panel lg:grid lg:grid-cols-[minmax(0,1fr)_17rem]">
      <form onSubmit={(e) => void submit(e)} className="p-5 sm:p-6">
        <p className="font-serif text-2xl text-foreground">Set up a task</p>
        <label className="mt-5 block">
          <span className="text-xs font-semibold text-foreground">Task</span>
          <input className={`${field} mt-1.5`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should the team do?" maxLength={120} required />
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => setTitle(example)} className={`${chip} ${title === example ? 'border-ember bg-ember/10' : ''}`}>{example}</button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="text-xs font-semibold text-foreground">Details</span>
          <textarea className={`${field} mt-1.5 resize-none`} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What it should do, what you already have, and when you need it." maxLength={4000} required />
        </label>
        <div className="mt-4">
          <span className="text-xs font-semibold text-foreground">Funds</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <div className="relative w-36">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-foreground" aria-hidden="true">€</span>
              <label className="sr-only" htmlFor="task-funds">Funds in euros</label>
              <input id="task-funds" className={`${field} pl-8`} value={funds} onChange={(e) => setFunds(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="450" required />
            </div>
            {AMOUNTS.map((n) => (
              <button key={n} type="button" onClick={() => setFunds(String(n))} className={`${chip} ${funds === String(n) ? 'border-ember bg-ember/10' : ''}`}>€{n.toLocaleString('en-US')}</button>
            ))}
          </div>
        </div>
        <button type="submit" disabled={busy} className="mt-6 w-full rounded-xl bg-ember px-5 py-3 text-sm font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60 sm:w-auto">{busy ? 'Sending…' : 'Send to the team'}</button>
        {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      </form>
      <aside className="border-t border-line bg-overlay/50 p-5 sm:p-6 lg:border-l lg:border-t-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">How it works</p>
        <ol className="mt-4 space-y-4">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember text-xs font-semibold text-on-ember">{i + 1}</span>
              <span className="text-sm leading-snug text-foreground">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-foreground/70">From €50. Released only when you approve the work.</p>
      </aside>
    </section>
  );
}

// Every task, project and team plan this person is part of, with the three people on it. The founder is the dedicated
// project manager on all of them.
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    void fetch('/api/project-manager')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Manager | null) => setManager(data?.name ? data : null))
      .catch(() => undefined);
    void fetchAuthed('/api/projects/funded')
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data: { projects?: Project[]; staff?: boolean }) => {
        setProjects(data.projects ?? []);
        setIsStaff(Boolean(data.staff));
      })
      .catch(() => setProjects([]));
  }, []);

  return (
    <AppShell title="Projects" subtitle="">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* The promise of every funded project: a dedicated project manager, the founder. */}
        <section className="flex items-center gap-4 rounded-3xl border border-ember/40 bg-ember/10 p-5">
          {manager?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the founder's profile picture
            <img src={manager.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
          ) : (
            <Initial name={manager?.name ?? 'F'} tone="h-12 w-12 bg-ember text-on-ember text-base" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember">Dedicated project manager</p>
            <p className="mt-0.5 text-base font-semibold text-foreground">{manager?.name ? `${manager.name}, BrandForge founder` : 'The BrandForge founder'}</p>
            <p className="text-sm text-foreground/80">Leads every funded project with you and your specialists, start to finish.</p>
          </div>
        </section>

        <NewTask />

        <section aria-label="Your work">
          <h2 className="font-serif text-2xl text-foreground">Your work</h2>
          {projects === null ? (
            <p className="mt-3 text-sm text-foreground/70">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-foreground/70">Nothing yet. Send a task above, or pick a team plan.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {projects.map((project) => {
                const stage = STAGE[project.status] ?? STAGE.funded;
                const action = project.isBuyer || !isStaff ? stage.buyer : stage.team;
                const urgent = action !== 'Open';
                return (
                  <li key={project.chatId} className="rounded-3xl border border-line bg-panel p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">{KIND[project.kind]}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stage.tone}`}>{stage.label}</span>
                        </p>
                        <p className="mt-1.5 truncate font-serif text-xl text-foreground">{project.title}</p>
                      </div>
                      {project.amount ? <p className="font-serif text-2xl text-foreground">€{project.amount.toLocaleString('en-US')}{project.kind === 'plan' ? <span className="text-sm text-foreground/70">/mo</span> : null}</p> : null}
                    </div>
                    {/* The three parties. */}
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="flex items-center gap-2 rounded-2xl bg-overlay px-3 py-2">
                        <Initial name={project.buyer?.name ?? 'B'} />
                        <div className="min-w-0"><p className="text-[11px] text-foreground/70">Buyer</p><p className="truncate text-sm font-medium text-foreground">{project.isBuyer ? 'You' : project.buyer?.name ?? 'Buyer'}</p></div>
                      </div>
                      <div className="flex items-center gap-2 rounded-2xl bg-overlay px-3 py-2">
                        <Initial name={project.specialists[0]?.name ?? '?'} />
                        <div className="min-w-0"><p className="text-[11px] text-foreground/70">{project.specialists.length > 1 ? 'Specialists' : 'Specialist'}</p><p className="truncate text-sm font-medium text-foreground">{project.specialists.length ? project.specialists.map((p) => p.name).join(', ') : 'Joins on accept'}</p></div>
                      </div>
                      <div className="flex items-center gap-2 rounded-2xl border border-ember/50 bg-ember/10 px-3 py-2">
                        <Initial name={manager?.name ?? 'F'} tone="bg-ember text-on-ember" />
                        <div className="min-w-0"><p className="text-[11px] font-semibold text-ember">Project manager</p><p className="truncate text-sm font-medium text-foreground">{manager?.name ?? 'The founder'}</p></div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-sm text-foreground/80">{project.total ? `${project.done} of ${project.total} done` : project.status === 'open' || project.status === 'countered' || project.status === 'accepted' ? 'Being agreed' : 'Starting'}</p>
                      <Link href={`/chat?conversationId=${project.chatId}`} className={urgent ? 'rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-on-ember transition hover:opacity-90' : 'rounded-xl border border-line px-4 py-2 text-sm font-semibold text-foreground transition hover:border-ember'}>{action}</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
