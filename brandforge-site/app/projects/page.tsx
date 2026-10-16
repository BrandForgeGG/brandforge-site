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
const STATUS: Record<string, string> = { funded: 'Funded', active: 'In progress', completed: 'Done' };

function Initial({ name, tone = 'bg-overlay text-foreground' }: { name: string; tone?: string }) {
  return <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone}`} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>;
}

// Set up a custom task: what it is and the funds for it. It opens its own chat with a card to fund it.
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
      setError(data.error || 'Could not set up the task. Try again.');
      return;
    }
    router.push(`/chat?conversationId=${data.chatId}`);
  }

  const field = 'w-full rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:border-ember focus:outline-none';
  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
      <p className="font-serif text-2xl text-foreground">Set up a task</p>
      <p className="mt-1 text-sm text-foreground/70">Say what you need and the funds for it. Fund it, and the team starts.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label className="block">
          <span className="text-xs font-semibold text-foreground">Task</span>
          <input className={`${field} mt-1.5`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A landing page for our app" maxLength={120} required />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-foreground">Funds (€)</span>
          <input className={`${field} mt-1.5`} value={funds} onChange={(e) => setFunds(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="450" required />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-xs font-semibold text-foreground">Details</span>
        <textarea className={`${field} mt-1.5 resize-none`} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What it should do, what you already have, and when you need it." maxLength={4000} required />
      </label>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-foreground/70">From €50. Held by BrandForge, released when you approve the work.</p>
        <button type="submit" disabled={busy} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60">{busy ? 'Setting up…' : 'Set up the task'}</button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
    </form>
  );
}

// Funded work: every task, project and team plan that has money behind it, with the three people on it. The founder is
// the dedicated project manager on all of them.
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);

  useEffect(() => {
    void fetch('/api/project-manager')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Manager | null) => setManager(data?.name ? data : null))
      .catch(() => undefined);
    void fetchAuthed('/api/projects/funded')
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data: { projects?: Project[] }) => setProjects(data.projects ?? []))
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

        <section aria-label="Funded projects">
          <h2 className="font-serif text-2xl text-foreground">Funded</h2>
          {projects === null ? (
            <p className="mt-3 text-sm text-foreground/70">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-foreground/70">No funded work yet. Set up a task above, or pick a team plan.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {projects.map((project) => (
                <li key={project.chatId} className="rounded-3xl border border-line bg-panel p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">{KIND[project.kind]} · {STATUS[project.status] ?? 'Funded'}</p>
                      <p className="mt-1 truncate font-serif text-xl text-foreground">{project.title}</p>
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
                      <div className="min-w-0"><p className="text-[11px] text-foreground/70">{project.specialists.length > 1 ? 'Specialists' : 'Specialist'}</p><p className="truncate text-sm font-medium text-foreground">{project.specialists.length ? project.specialists.map((p) => p.name).join(', ') : 'Being matched'}</p></div>
                    </div>
                    <div className="flex items-center gap-2 rounded-2xl border border-ember/50 bg-ember/10 px-3 py-2">
                      <Initial name={manager?.name ?? 'F'} tone="bg-ember text-on-ember" />
                      <div className="min-w-0"><p className="text-[11px] font-semibold text-ember">Project manager</p><p className="truncate text-sm font-medium text-foreground">{manager?.name ?? 'The founder'}</p></div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-foreground/80">{project.total ? `${project.done} of ${project.total} done` : 'Starting'}</p>
                    <Link href={`/chat?conversationId=${project.chatId}`} className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-on-ember transition hover:opacity-90">Open</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
