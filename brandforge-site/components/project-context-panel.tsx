'use client';

import type { ClientProjectState } from '@/lib/conversation-state';
import { DISCOVERY_THRESHOLD } from '@/lib/discovery';

export interface ProposalSummary {
  id: string;
  title: string;
  scope?: string | null;
  total_amount: number;
  currency: string;
  estimated_weeks_min?: number | null;
  estimated_weeks_max?: number | null;
  status: 'pending' | 'changes_requested' | 'accepted' | 'declined' | 'expired';
}

export interface AgreementSummary {
  id: string;
  terms: string;
  total_amount: number;
  currency: string;
  status: 'pending_funding' | 'funded' | 'active' | 'completed' | 'cancelled';
}

export interface PaymentSummary {
  id: string;
  sequence: number;
  title: string;
  amount: number;
  currency: string;
  status: string;
}

export const STATUS_LABELS: Record<string, string> = {
  DISCOVERY: 'Discovery',
  READY_FOR_REVIEW: 'With BrandForge',
  REVIEW: 'BrandForge review',
  PROPOSED: 'Proposal in chat',
  ACCEPTED: 'Agreement accepted',
  ACTIVE: 'In delivery',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function money(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) {
    return '—';
  }

  return `${currency} ${Number(amount).toLocaleString()}`;
}

export function ProjectContextPanel({
  state,
  proposal,
  agreement,
  payments,
  busyAction,
  onClose,
  onRequestReview,
  onProposalAction,
  onFundProject,
  onTaskAction,
}: {
  state: ClientProjectState | null;
  proposal: ProposalSummary | null;
  agreement: AgreementSummary | null;
  payments: PaymentSummary[];
  busyAction: string | null;
  onClose: () => void;
  onRequestReview: () => void;
  onProposalAction: (action: 'accept' | 'decline' | 'request_changes') => void;
  onFundProject: () => void;
  onTaskAction: (taskId: string, payload: { action?: string; status?: string }) => void;
}) {
  const discovery = state?.discovery;
  const canRequestReview =
    state?.status === 'DISCOVERY' && (discovery?.completeness ?? 0) >= DISCOVERY_THRESHOLD;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-[85vw] shrink-0 flex-col border-l border-white/10 bg-[#111417] shadow-2xl xl:sticky xl:top-0 xl:z-auto xl:h-screen xl:max-w-none xl:shadow-none">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Project</p>
          <h2 className="mt-1 truncate font-serif text-lg text-[#ece7de]">
            {state?.project.name || state?.title || 'New project'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1.5 text-[#9aa0a6] transition hover:bg-white/5 hover:text-[#ece7de]"
          aria-label="Hide project insights"
        >
          <span aria-hidden="true">x</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Status</p>
          <div
            className={`rounded-xl border px-3 py-2 ${
              state?.status && state.status !== 'DISCOVERY'
                ? 'border-[#5aa578]/40 bg-[#5aa578]/10'
                : 'border-white/10 bg-[#1c2024]'
            }`}
          >
            <span className="text-sm text-[#ece7de]">
              {state ? STATUS_LABELS[state.status] ?? state.status : '—'}
            </span>
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Discovery</p>
          <div className="rounded-xl border border-white/10 bg-[#1c2024] px-3 py-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[#e8571e] transition-all"
                  style={{ width: `${discovery?.percent ?? 0}%` }}
                />
              </div>
              <span className="text-xs text-[#ece7de]">{discovery?.percent ?? 0}%</span>
            </div>

            <ul className="space-y-1">
              {(discovery?.checklist ?? []).map((step) => (
                <li key={step.key} className="flex items-center gap-2 text-xs">
                  <span className={step.met ? 'text-[#5aa578]' : 'text-[#6f757b]'}>
                    {step.met ? '✓' : '○'}
                  </span>
                  <span className={step.met ? 'text-[#ece7de]' : 'text-[#9aa0a6]'}>{step.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Requirements</p>
          <div className="rounded-xl border border-white/10 bg-[#1c2024] px-3 py-2">
            <p className="text-sm text-[#ece7de]">
              {state ? state.requirementsCount : 0}
              <span className="text-[#9aa0a6]"> captured</span>
            </p>
            {state && state.requirements.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {state.requirements.slice(-5).map((requirement) => (
                  <li key={requirement.id} className="truncate text-xs text-[#9aa0a6]">
                    • {requirement.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-[#9aa0a6]">Nothing captured yet.</p>
            )}
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Open questions</p>
          <div className="rounded-xl border border-white/10 bg-[#1c2024] px-3 py-2">
            <p className="text-sm text-[#ece7de]">
              {state ? state.openQuestions.length : 0}
            </p>
            {state && state.openQuestions.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {state.openQuestions.slice(0, 4).map((question) => (
                  <li key={question.id} className="text-xs leading-relaxed text-[#9aa0a6]">
                    • {question.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-[#9aa0a6]">No open questions.</p>
            )}
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Milestones</p>
          <div className="rounded-xl border border-white/10 bg-[#1c2024] px-3 py-2">
            {state && state.milestones.length > 0 ? (
              <>
                <ul className="space-y-2">
                  {state.milestones.map((milestone) => (
                    <li key={milestone.id} className="text-xs text-[#ece7de]">
                      <span className="text-[#b8763b]">{milestone.sequence}. </span>
                      {milestone.title}
                      <span className="block text-[#9aa0a6]">
                        {milestone.estimatedWeeks ? `${milestone.estimatedWeeks} weeks` : 'duration TBD'}
                        {milestone.amount ? ` · ${money(milestone.amount, milestone.currency ?? 'EUR')}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] uppercase tracking-[0.15em] text-[#6f757b]">
                  AI-suggested · not final
                </p>
              </>
            ) : (
              <p className="text-sm text-[#9aa0a6]">Not drafted yet.</p>
            )}
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">Tasks</p>
          <div className="rounded-xl border border-white/10 bg-[#1c2024] px-3 py-2">
            {state && state.tasks.length > 0 ? (
              <ul className="space-y-2">
                {state.tasks.map((task) => {
                  const statusLabel =
                    task.status === 'DONE'
                      ? 'done'
                      : task.status === 'REVIEW'
                        ? 'awaiting your approval'
                        : task.status === 'IN_PROGRESS'
                          ? 'in progress'
                          : 'queued';

                  return (
                    <li key={task.id} className="text-xs text-[#ece7de]">
                      <p className="leading-relaxed">{task.title}</p>
                      <p className="mt-0.5 text-[#9aa0a6]">
                        {statusLabel}
                        {task.assigneeName ? ` · ${task.assigneeName}` : ' · unassigned'}
                      </p>
                      {task.status === 'REVIEW' ? (
                        <div className="mt-1.5 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => onTaskAction(task.id, { status: 'DONE' })}
                            disabled={busyAction !== null}
                            className="rounded-lg bg-[#5aa578] px-2 py-1 text-[10px] font-semibold text-[#14171a] transition hover:opacity-95 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => onTaskAction(task.id, { status: 'IN_PROGRESS' })}
                            disabled={busyAction !== null}
                            className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-[#9aa0a6] transition hover:border-[#e8571e] disabled:opacity-60"
                          >
                            Send back
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[#9aa0a6]">No tasks yet.</p>
            )}
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[#9aa0a6]">AI estimate</p>
          <div className="rounded-xl border border-[#e8571e]/20 bg-[#14171a] px-3 py-2">
            {state?.estimate ? (
              <>
                <p className="text-xs text-[#b8763b]">AI-generated · not final</p>
                <p className="mt-1 text-sm text-[#ece7de]">
                  {money(state.estimate.costMin, state.estimate.currency)}–{money(state.estimate.costMax, state.estimate.currency)}
                </p>
                <p className="mt-1 text-xs text-[#9aa0a6]">
                  {state.estimate.weeksMin ?? '?'}–{state.estimate.weeksMax ?? '?'} weeks delivery
                </p>
              </>
            ) : (
              <p className="text-sm text-[#9aa0a6]">Not enough scope yet.</p>
            )}
          </div>
        </div>

        {proposal && proposal.status === 'pending' ? (
          <div className="mb-6 rounded-xl border border-[#e8571e]/30 bg-[#1c2024] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">BrandForge proposal</p>
            <h3 className="mt-1 font-serif text-base text-[#ece7de]">{proposal.title}</h3>
            {proposal.scope ? (
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[#9aa0a6]">{proposal.scope}</p>
            ) : null}
            <p className="mt-3 text-lg text-[#ece7de]">
              {money(proposal.total_amount, proposal.currency)}
            </p>
            <p className="mt-1 text-xs text-[#9aa0a6]">
              {proposal.estimated_weeks_min ?? '?'}–{proposal.estimated_weeks_max ?? '?'} weeks delivery
            </p>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => onProposalAction('accept')}
                disabled={busyAction !== null}
                className="w-full rounded-lg bg-[#5aa578] px-3 py-2 text-xs font-semibold text-[#14171a] transition hover:opacity-95 disabled:opacity-60"
              >
                Accept proposal
              </button>
              <button
                type="button"
                onClick={() => onProposalAction('request_changes')}
                disabled={busyAction !== null}
                className="w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-[#ece7de] transition hover:border-[#e8571e] disabled:opacity-60"
              >
                Request changes
              </button>
              <button
                type="button"
                onClick={() => onProposalAction('decline')}
                disabled={busyAction !== null}
                className="w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-[#9aa0a6] transition hover:border-red-500/40 hover:text-red-200 disabled:opacity-60"
              >
                Decline
              </button>
            </div>
          </div>
        ) : null}

        {agreement ? (
          <div className="mb-6 rounded-xl border border-white/10 bg-[#1c2024] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Agreement</p>
            <p className="mt-1 text-sm text-[#ece7de]">
              {money(agreement.total_amount, agreement.currency)} · {agreement.status.replace('_', ' ')}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[#9aa0a6]">{agreement.terms}</p>

            {payments.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between text-xs text-[#9aa0a6]">
                    <span className="truncate">
                      {payment.sequence}. {payment.title}
                    </span>
                    <span className="ml-2 whitespace-nowrap text-[#ece7de]">
                      {money(payment.amount, payment.currency)} · {payment.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {agreement.status === 'pending_funding' ? (
              <button
                type="button"
                onClick={onFundProject}
                disabled={busyAction !== null}
                className="mt-3 w-full rounded-lg bg-[#e8571e] px-3 py-2 text-xs font-semibold text-[#14171a] transition hover:opacity-95 disabled:opacity-60"
              >
                {busyAction === 'fund' ? 'Starting escrow…' : 'Fund project'}
              </button>
            ) : null}
          </div>
        ) : null}

        {canRequestReview ? (
          <button
            type="button"
            onClick={onRequestReview}
            disabled={busyAction !== null}
            className="w-full rounded-xl bg-[#e8571e] px-4 py-3 text-sm font-semibold text-[#14171a] transition hover:opacity-95 disabled:opacity-60"
          >
            {busyAction === 'review' ? 'Sending…' : 'Send to BrandForge review'}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
