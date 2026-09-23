'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import {
  createProject,
  fallbackMilestoneApprovals,
  fallbackProjects,
  getProjectWorkflowSummary,
  getProjects,
  getTasks,
  nextProjectStatus,
  type BrandForgeApproval,
  type BrandForgeProject,
  type BrandForgeTask,
} from '@/lib/brandforge-data';
import { getDemoSessionEmail } from '@/lib/auth-utils';
import { getSessionUser } from '@/lib/browser-auth';
import { buildApprovalSummary, upsertApproval } from '@/lib/workflow-utils';
import { getVisibleProjects } from '@/lib/user-roles';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<BrandForgeProject[]>(fallbackProjects);
  const [tasks, setTasks] = useState<BrandForgeTask[]>([]);
  const [approvals, setApprovals] = useState<BrandForgeApproval[]>(fallbackMilestoneApprovals);
  const [showForm, setShowForm] = useState(false);
  const [highlightedProjectId, setHighlightedProjectId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState('You');
  const visibleProjects: BrandForgeProject[] = getVisibleProjects(projects, userEmail);
  const workflowSummary = getProjectWorkflowSummary(visibleProjects);
  const approvalSummary = buildApprovalSummary(approvals);
  const approvalQueue = useMemo(() => approvals.slice(0, 3), [approvals]);

  function getProjectReadiness(project: BrandForgeProject) {
    const base = Math.min(100, Math.max(28, project.progress));
    const approval = approvals.find((entry) => entry.projectId === project.id);

    if (approval?.status === 'APPROVED') {
      return Math.min(100, base + 12);
    }

    if (approval?.status === 'CHANGES_REQUESTED') {
      return Math.max(35, base - 8);
    }

    if (project.status === 'REVIEW' || project.status === 'AWAITING_APPROVAL') {
      return Math.min(100, base + 6);
    }

    return base;
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const targetName = new URLSearchParams(window.location.search).get('project')?.trim().toLowerCase();
    if (!targetName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHighlightedProjectId(null);
      return;
    }

    setHighlightedProjectId(visibleProjects.find((project) => project.title.toLowerCase() === targetName)?.id ?? null);
  }, [visibleProjects]);
  const [form, setForm] = useState({
    title: '',
    client: '',
    budget: '',
    timeline: '',
    description: '',
  });

  useEffect(() => {
    async function loadUser() {
      const demoEmail = getDemoSessionEmail();
      if (demoEmail) {
        setUserEmail(demoEmail);
        setUserName(demoEmail.split('@')[0]);
        return;
      }

      const user = await getSessionUser();
      const email = user?.email ?? null;
      if (!email) {
        return;
      }

      setUserEmail(email);
      const fullName =
        user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? null;
      setUserName(fullName?.trim() || email.split('@')[0]);
    }

    void loadUser();
  }, []);

  useEffect(() => {
    async function loadProjects() {
      const nextProjects = await getProjects();
      setProjects(nextProjects);

      try {
        const nextTasks = await getTasks();
        setTasks(nextTasks);
      } catch {
        setTasks([]);
      }

      try {
        const response = await fetch('/api/approvals', { cache: 'no-store' });
        if (response.ok) {
          const payload = await response.json();
          if (Array.isArray(payload.approvals)) {
            setApprovals(payload.approvals);
          }
        }
      } catch {
        // keep local fallback approval state when the API is unavailable
      }
    }

    loadProjects();
  }, []);

  function handleFieldChange(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const created = await createProject(form);
    if (!created) {
      return;
    }

    setProjects((current) => [created, ...current]);
    setForm({ title: '', client: '', budget: '', timeline: '', description: '' });
    setShowForm(false);
  }

  function advanceProject(projectId: string) {
    setProjects((current) =>
      current.map((project: BrandForgeProject) => {
        if (project.id !== projectId) {
          return project;
        }

        const nextStatus = nextProjectStatus(project.status);
        const nextProgress = Math.min(Math.max(project.progress + 12, 12), 100);

        return {
          ...project,
          status: nextStatus,
          progress: nextStatus === 'COMPLETED' ? 100 : nextProgress,
          nextMilestone:
            nextStatus === 'COMPLETED'
              ? 'Delivery approved and closed'
              : nextStatus === 'REVIEW'
                ? 'Stakeholder review and signoff'
                : 'Execution checkpoint and milestone update',
        };
      })
    );
  }

  async function updateApproval(projectId: string, status: 'APPROVED' | 'CHANGES_REQUESTED') {
    const project = projects.find((entry: BrandForgeProject) => entry.id === projectId);
    const milestone = project?.nextMilestone ?? 'Current milestone';
    const nextApproval = {
      projectId,
      milestone,
      status,
      owner: userName,
      updatedAt: 'Now',
      comment:
        status === 'APPROVED'
          ? 'Approved for the next phase. Delivery can continue.'
          : 'Changes requested before advancing the milestone.',
    };

    setApprovals((current) => upsertApproval(current, nextApproval));

    try {
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextApproval),
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      if (payload.approval) {
        setApprovals((current) => upsertApproval(current, payload.approval));
      }
    } catch {
      // leaving the optimistic local approval intact keeps the UI responsive when the DB is unavailable
    }
  }

  // Owners can remove a project they created; the API cleans up its members, approvals and tasks.
  async function handleDeleteProject(project: BrandForgeProject) {
    if (!window.confirm('Delete "' + project.title + '"? Its members, approvals and tasks go too.')) {
      return;
    }

    try {
      const response = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'The project could not be deleted');
      }

      setProjects((current) => current.filter((entry) => entry.id !== project.id));
      setApprovals((current) => current.filter((entry) => entry.projectId !== project.id));
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : 'The project could not be deleted');
    }
  }

  return (
    <AppShell
      title="Projects"
      subtitle="Track delivery, approvals, and the operational status of every active initiative."
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Pipeline</p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="rounded-xl bg-[#e8571e] px-4 py-2 text-sm font-semibold text-[#14171a]"
        >
          {showForm ? 'Close' : 'New project'}
        </button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-white/10 bg-[#1c2024] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Total</p>
          <p className="mt-2 text-2xl font-serif text-[#ece7de]">{workflowSummary.total}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#1c2024] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">In flight</p>
          <p className="mt-2 text-2xl font-serif text-[#e8571e]">{workflowSummary.inFlight}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#1c2024] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Review</p>
          <p className="mt-2 text-2xl font-serif text-[#b8763b]">{workflowSummary.atReview}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#1c2024] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Closed</p>
          <p className="mt-2 text-2xl font-serif text-[#5aa578]">{workflowSummary.completed}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#1c2024] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Approved</p>
          <p className="mt-2 text-2xl font-serif text-[#5aa578]">{approvalSummary.approved}</p>
        </div>
      </div>

      {showForm ? (
        <form onSubmit={handleCreateProject} className="mb-6 rounded-2xl border border-white/10 bg-[#1c2024] p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-[#9aa0a6]">Project name</label>
              <input
                value={form.title}
                onChange={(event) => handleFieldChange('title', event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#14171a] px-3 py-2.5 text-[#ece7de] outline-none focus:ring-2 focus:ring-[#e8571e]/60"
                placeholder="Brand refresh sprint"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#9aa0a6]">Client</label>
              <input
                value={form.client}
                onChange={(event) => handleFieldChange('client', event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#14171a] px-3 py-2.5 text-[#ece7de] outline-none focus:ring-2 focus:ring-[#e8571e]/60"
                placeholder="Northstar Labs"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#9aa0a6]">Budget</label>
              <input
                value={form.budget}
                onChange={(event) => handleFieldChange('budget', event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#14171a] px-3 py-2.5 text-[#ece7de] outline-none focus:ring-2 focus:ring-[#e8571e]/60"
                placeholder="$6,500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#9aa0a6]">Timeline</label>
              <input
                value={form.timeline}
                onChange={(event) => handleFieldChange('timeline', event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#14171a] px-3 py-2.5 text-[#ece7de] outline-none focus:ring-2 focus:ring-[#e8571e]/60"
                placeholder="5 weeks"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm text-[#9aa0a6]">Description</label>
            <textarea
              value={form.description}
              onChange={(event) => handleFieldChange('description', event.target.value)}
              className="min-h-24 w-full rounded-xl border border-white/10 bg-[#14171a] px-3 py-2.5 text-[#ece7de] outline-none focus:ring-2 focus:ring-[#e8571e]/60"
              placeholder="Outline the brief, primary goals, and expected launch timeline."
            />
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-[#e8571e] px-4 py-2 text-sm font-semibold text-[#14171a]"
            >
              Save project
            </button>
          </div>
        </form>
      ) : null}

      <div className="space-y-4">
        {visibleProjects.map((project) => {
          const isHighlighted = project.id === highlightedProjectId;
          const readiness = getProjectReadiness(project);
          const approval = approvals.find((entry) => entry.projectId === project.id);
          const statusLabel = approval?.status === 'APPROVED'
            ? 'Ready to ship'
            : approval?.status === 'CHANGES_REQUESTED'
              ? 'Needs revision'
              : project.status === 'REVIEW'
                ? 'Awaiting signoff'
                : 'In motion';

          return (
            <div
              key={project.id}
              className={`rounded-2xl border p-5 transition ${
                isHighlighted
                  ? 'border-[#e8571e]/60 bg-[#201b18] shadow-[0_0_0_1px_rgba(232,87,30,0.4)]'
                  : 'border-white/10 bg-[#1c2024]'
              }`}
            >
              {isHighlighted ? (
                <div className="mb-3 inline-flex items-center rounded-full border border-[#e8571e]/50 bg-[#e8571e]/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[#f6d6c3]">
                  Latest project
                </div>
              ) : null}
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">{project.status}</p>
                  <h2 className="mt-2 text-2xl font-serif text-[#ece7de]">{project.title}</h2>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded-full border border-[#e8571e]/40 bg-[#e8571e]/10 px-3 py-1 text-sm text-[#e8571e]">
                    {project.progress}% complete
                  </div>
                  <button
                    type="button"
                    onClick={() => advanceProject(project.id)}
                    className="rounded-xl border border-white/10 bg-[#14171a] px-3 py-1.5 text-xs text-[#ece7de]"
                  >
                    Advance stage
                  </button>
                  {project.canManage ? (
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteProject(project);
                      }}
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-[#9aa0a6] transition hover:border-red-400/40 hover:text-red-200"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#5aa578]/30 bg-[#5aa578]/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[#d9f7ea]">
                  Readiness {Math.round(readiness)}%
                </span>
                <span className="rounded-full border border-white/10 bg-[#14171a] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[#9aa0a6]">
                  {statusLabel}
                </span>
              </div>

              <p className="mb-4 max-w-2xl text-[#9aa0a6]">{project.description}</p>

            <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-[#e8571e]" style={{ width: `${project.progress}%` }} />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-[#14171a] p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Budget</p>
                <p className="mt-2 text-lg font-medium">{project.budget}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#14171a] p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Timeline</p>
                <p className="mt-2 text-lg font-medium">{project.timeline}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#14171a] p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Owner</p>
                <p className="mt-2 text-base font-medium">{project.operator}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#14171a] p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Next</p>
                <p className="mt-2 text-base font-medium">{project.nextMilestone}</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-[#14171a] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Launch checklist</p>
              </div>

              <div className="space-y-2">
                {(tasks.filter((task) => task.projectId === project.id).slice(0, 4).length > 0
                  ? tasks.filter((task) => task.projectId === project.id).slice(0, 4)
                  : [
                      { id: `${project.id}-task-1`, title: project.nextMilestone, status: 'TODO', owner: 'BrandForge Team', due: 'This week' },
                      { id: `${project.id}-task-2`, title: 'Review kickoff brief and deliverables', status: 'TODO', owner: 'Founder', due: 'Next 48h' },
                    ]
                ).map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#1c2024] px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-[#ece7de]">{task.title}</p>
                      <p className="mt-1 text-xs text-[#9aa0a6]">{task.owner} • {task.due}</p>
                    </div>
                    <span className="rounded-full border border-[#e8571e]/30 bg-[#e8571e]/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[#f6d6c3]">
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-[#14171a] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Milestone approval</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateApproval(project.id, 'APPROVED')}
                      className="rounded-lg bg-[#5aa578] px-3 py-1.5 text-xs font-medium text-[#0d1713]"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => updateApproval(project.id, 'CHANGES_REQUESTED')}
                      className="rounded-lg border border-[#b8763b]/40 bg-[#b8763b]/10 px-3 py-1.5 text-xs font-medium text-[#f6d6c3]"
                    >
                      Request changes
                    </button>
                  </div>
                </div>

                {(() => {
                  const approval = approvals.find((entry) => entry.projectId === project.id);

                  if (!approval) {
                    return (
                      <p className="text-sm text-[#9aa0a6]">
                        No milestone approval has been recorded yet for this project.
                      </p>
                    );
                  }

                  const tone =
                    approval.status === 'APPROVED'
                      ? 'text-[#5aa578]'
                      : approval.status === 'CHANGES_REQUESTED'
                        ? 'text-[#f6d6c3]'
                        : 'text-[#b8763b]';

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`text-sm font-medium ${tone}`}>{approval.status}</span>
                        <span className="text-xs text-[#9aa0a6]">{approval.updatedAt}</span>
                      </div>
                      <p className="text-sm text-[#ece7de]">{approval.milestone}</p>
                      <p className="text-sm text-[#9aa0a6]">{approval.comment}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-[#6d7680]">Owner: {approval.owner}</p>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-[#1c2024] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Approval queue</p>
          <span className="rounded-full border border-[#e8571e]/30 bg-[#e8571e]/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[#f6d6c3]">
            {approvalSummary.pending} pending
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {approvalQueue.map((approval) => {
            const project = projects.find((entry) => entry.id === approval.projectId);
            const tone =
              approval.status === 'APPROVED'
                ? 'border-[#5aa578]/30 bg-[#5aa578]/10 text-[#d9f7ea]'
                : approval.status === 'CHANGES_REQUESTED'
                  ? 'border-[#b8763b]/30 bg-[#b8763b]/10 text-[#f6d6c3]'
                  : 'border-[#e8571e]/30 bg-[#e8571e]/10 text-[#f6d6c3]';

            return (
              <div key={approval.id} className="rounded-2xl border border-white/10 bg-[#14171a] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[#ece7de]">{project?.title ?? 'Project milestone'}</p>
                  <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${tone}`}>
                    {approval.status}
                  </span>
                </div>
                <p className="mt-3 text-sm text-[#9aa0a6]">{approval.milestone}</p>
                <p className="mt-2 text-sm text-[#d3d7dc]">{approval.comment}</p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[#6d7680]">{approval.owner} • {approval.updatedAt}</p>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
