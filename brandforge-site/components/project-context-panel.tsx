'use client';

import { useEffect, useRef, useState } from 'react';
import { buildProjectPulse, describeAgreementStatus, describeNextDeliveryAction, describePaymentStatus, describeProposalStatus, isTaskOverdue, summarizeTaskProgress } from '@/lib/task-board';
import { COMMUNITY_LINKS } from '@/lib/community';
import { avatarTone, formatRole, initialsFor } from '@/lib/identity-display';
import type { ClientProjectState } from '@/lib/conversation-state';
import { DISCOVERY_THRESHOLD } from '@/lib/discovery';

export interface TaskParticipant {
  userId: string;
  displayName: string;
  role: string;
}

export interface ProposalSummary {
  id: string;
  title: string;
  scope?: string | null;
  total_amount: number;
  currency: string;
  estimated_weeks_min?: number | null;
  estimated_weeks_max?: number | null;
  status:
    | 'pending'
    | 'countered'
    | 'counter_back'
    | 'changes_requested'
    | 'accepted'
    | 'declined'
    | 'expired';
  /** Counter round (migration 0017): 1 = founder countered, 2 = specialist's final offer. */
  counter_round?: number | null;
  counter_total_amount?: number | null;
  counter_weeks_min?: number | null;
  counter_weeks_max?: number | null;
  counter_note?: string | null;
}

export interface AgreementSummary {
  id: string;
  terms: string;
  total_amount: number;
  currency: string;
  status: 'pending_funding' | 'funded' | 'active' | 'completed' | 'cancelled';
  /** Contract signature (migration 0013): each side accepts the current terms; a terms
      revision clears both. Absent until the migration is applied. */
  founder_accepted_at?: string | null;
  team_accepted_at?: string | null;
  terms_updated_at?: string | null;
}

export interface PaymentSummary {
  id: string;
  sequence: number;
  title: string;
  amount: number;
  currency: string;
  status: string;
  tx_hash?: string | null;
  network?: string | null;
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

// What the client sees for each raw payment status. 'pending' means the client submitted a
// transaction hash and BrandForge is verifying it on-chain; 'paid' means verified and held.
function money(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) {
    return '—';
  }

  return `${currency} ${Number(amount).toLocaleString()}`;
}

function shortHash(hash: string): string {
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
}

function shortDate(value: string | null): string | null {
  if (!value) return null;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().slice(0, 10);
}

export function ProjectContextPanel({
  state,
  proposal,
  agreement,
  payments,
  busyAction,
  isStaff,
  participants,
  files,
  onClose,
  onRequestReview,
  onSubmitPayment,
  onPaymentAction,
   onTaskAction,
  }: {
  state: ClientProjectState | null;
  proposal: ProposalSummary | null;
  agreement: AgreementSummary | null;
  payments: PaymentSummary[];
  busyAction: string | null;
  isStaff: boolean;
  participants: TaskParticipant[];
  /** Real attachments in this chat, derived from persisted messages - never fabricated. */
  files: { name: string; size: number; contentType: string; path: string }[];
  onClose: () => void;
  onRequestReview: () => void;
  onSubmitPayment: (txHash: string) => void;
  onPaymentAction: (payload: {
    action: 'verify' | 'reject' | 'release';
    paymentId?: string;
    note?: string;
  }) => void;
  onTaskAction: (
    taskId: string,
    payload: { action?: string; status?: string; assigneeId?: string; dueDate?: string | null }
  ) => void;
}) {
   const discovery = state?.discovery;
  const canRequestReview =
    state?.status === 'DISCOVERY' && (discovery?.completeness ?? 0) >= DISCOVERY_THRESHOLD;

  const [txInput, setTxInput] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [walletCopied, setWalletCopied] = useState(false);
  const [txCopied, setTxCopied] = useState(false);
  const copyText = (value: string, done: (copied: boolean) => void) => {
    void navigator.clipboard?.writeText(value).then(() => {
      done(true);
      setTimeout(() => done(false), 1500);
    });
  };
  // Task actions are independent: each row locks only itself, so assigning one task never
  // freezes the rest of the panel. The row unlocks when fresh state arrives after the action.
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  const lastTaskSignatureRef = useRef('');
  const taskSignature = state
    ? state.tasks.map((task) => `${task.id}:${task.status}:${task.assigneeName ?? ''}:${task.dueDate ?? ''}`).join('|')
    : '';

  useEffect(() => {
    if (taskSignature !== lastTaskSignatureRef.current) {
      lastTaskSignatureRef.current = taskSignature;
      setTaskBusyId(null);
    }
  }, [taskSignature]);

  const taskControlsDisabled = (taskId: string) =>
    (busyAction !== null && busyAction.startsWith('task-')) ||
    (taskBusyId !== null && taskBusyId !== `task-${taskId}`);
  const runTaskAction = (
    taskId: string,
    payload: { action?: string; status?: string; assigneeId?: string; dueDate?: string | null }
  ) => {
    setTaskBusyId(`task-${taskId}`);
    onTaskAction(taskId, payload);
  };

  // The deposit wallet is configured per deployment. When it is missing the client is told to
  // take deposit details from the chat instead of seeing a fabricated address.
  const depositWallet = process.env.NEXT_PUBLIC_DEPOSIT_WALLET_ADDRESS ?? '';
  const depositNetwork = process.env.NEXT_PUBLIC_DEPOSIT_NETWORK ?? '';

  // Funding covers the full agreement total, so every scheduled payment moves together.
  const fundingSubmitted =
    payments.length > 0 && payments.every((payment) => payment.status !== 'scheduled');
  const submittedTx = payments.find((payment) => payment.tx_hash)?.tx_hash ?? null;
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  // Tracked as state so the "Open project details" button can advertise what it will do
  // (aria-expanded / aria-controls) instead of mutating the DOM attribute behind React's back.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const openDetails = () => {
    setDetailsOpen(true);
    const node = detailsRef.current;
    if (!node) return;
    // The <details> element may already be open (the user can toggle it themselves), so only
    // force the attribute when it is actually closed.
    if (!node.open) node.setAttribute('open', '');
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    node.focus?.();
  };

  const projectPulse = buildProjectPulse({ state, proposal, agreement, tasks: state?.tasks ?? [] });
  const taskProgress = state ? summarizeTaskProgress(state.tasks) : null;

  // The drawer is dismissible by keyboard: Escape returns the reader to the chat,
  // unless they are typing (then it only leaves the field, standard behavior).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const submittedNetwork = payments.find((payment) => payment.network)?.network ?? null;

  // "What happens next?" - the next delivery task, else the first unmet discovery step,
  // else an honest prompt. Never a fabricated milestone.
  const nextDeliveryRaw = describeNextDeliveryAction(state?.tasks ?? []);
  const nextDelivery = nextDeliveryRaw.startsWith('Next: ')
    ? nextDeliveryRaw.slice('Next: '.length)
    : nextDeliveryRaw === 'No delivery tasks are planned yet.'
      ? null
      : nextDeliveryRaw;
  const nextDiscoveryStep = (discovery?.checklist ?? []).find((step) => !step.met)?.label ?? null;
  const nextStepLabel =
    nextDelivery ?? nextDiscoveryStep ?? 'Describe your project in the chat to get started';

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-[85vw] shrink-0 flex-col border-l border-white/10 bg-[#111417] shadow-2xl xl:sticky xl:top-0 xl:z-auto xl:h-screen xl:max-w-none xl:shadow-none">
      <div className="bf-panel-header flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Project</p>
          <h2 className="mt-1 truncate font-serif text-lg text-[#ece7de]">
            {state?.project.name || state?.title || 'New project'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="bf-panel-close shrink-0"
          aria-label="Hide project insights"
        >
          <span aria-hidden="true">x</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="bf-panel-section">
          <p className="bf-section-label">Project pulse</p>
          <div className="bf-panel-card bf-panel-card-emphasis">
            <div className="grid gap-2">
              {projectPulse.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-[#9aa0a6]">{item.label}</span>
                  <span className="text-right text-[#ece7de]">{item.value}</span>
                </div>
              ))}
              {projectPulse.length === 0 ? <p className="text-xs text-[#9aa0a6]">Start the conversation to shape the project.</p> : null}
            </div>
            <button
              type="button"
              onClick={openDetails}
              aria-expanded={detailsOpen}
              aria-controls="bf-project-details"
              className="mt-3 text-xs font-semibold text-[#b8763b] hover:text-[#ece7de]"
            >
              {detailsOpen ? 'Project details expanded' : 'Open project details →'}
            </button>
          </div>
        </div>

        <div className="bf-panel-section">
          <p className="bf-section-label">Next</p>
          <div className="bf-panel-card bf-panel-card-emphasis">
            <p className="text-sm leading-relaxed text-[#ece7de]">{nextStepLabel}</p>
          </div>
        </div>

        <div className="bf-panel-section">
          <p className="bf-section-label">Requirements</p>
          <div className="bf-panel-card">
            {state && state.requirements.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-sm text-[#ece7de]">
                  {state.requirementsCount}
                  <span className="text-[#9aa0a6]"> captured</span>
                </summary>
                <ul className="mt-2 space-y-1">
                  {state.requirements.slice(-5).map((requirement) => (
                    <li key={requirement.id} className="flex items-start gap-2 text-xs">
                      <span className="text-[#5aa578]" aria-hidden="true">✓</span>
                      <span className="min-w-0 text-[#9aa0a6]">{requirement.title}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="text-xs text-[#9aa0a6]">Nothing captured yet.</p>
            )}
          </div>
        </div>

        <div className="bf-panel-section">
          <p className="bf-section-label">Team</p>
          <div className="bf-panel-card">
            <ul className="space-y-2.5">
              <li className="flex items-center gap-2.5">
                <span className="bf-stack-item bf-stack-ai" aria-hidden="true">B</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs text-[#ece7de]">BrandForge AI</span>
                  <span className="block text-[10px] uppercase tracking-[0.14em] text-[#8f959b]">Execution Assistant</span>
                </span>
              </li>
              {participants.map((person) => (
                <li key={person.userId} className="flex items-center gap-2.5">
                  <span className="bf-stack-item" style={avatarTone(person.userId)} aria-hidden="true">
                    {initialsFor(person.displayName)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-[#ece7de]">{person.displayName}</span>
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-[#8f959b]">{formatRole(person.role)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bf-panel-section">
          <p className="bf-section-label">Files</p>
          <div className="bf-panel-card">
            {files.length > 0 ? (
              <ul className="space-y-1.5">
                {files.map((file) => (
                  <li key={file.path}>
                    <a
                      href={`/api/attachments?path=${encodeURIComponent(file.path)}`}
                      className="flex items-center gap-2 text-xs text-[#ece7de] transition hover:text-[#e8571e]"
                    >
                      <span aria-hidden="true">📄</span>
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-[10px] text-[#9aa0a6]">{Math.ceil(file.size / 1024)} KB</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#9aa0a6]">No files yet.</p>
            )}
          </div>
        </div>

        <details
          ref={detailsRef}
          id="bf-project-details"
          className="bf-panel-section group"
          onToggle={(event) => setDetailsOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="bf-section-label cursor-pointer list-none">Project details</summary>
          <div className="mt-4">
        <div className="bf-panel-section">
          <div className={`bf-panel-card ${state?.status && state.status !== 'DISCOVERY' ? 'bf-panel-card-emphasis' : ''}`}>
            <span className="text-sm text-[#ece7de]">
              {state ? STATUS_LABELS[state.status] ?? state.status : '—'}
            </span>
          </div>
        </div>

        <div className="bf-panel-section">
          <p className="bf-section-label">Discovery</p>
          <div className="bf-panel-card">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[#e8571e] transition-[width]"
                  style={{ width: `${discovery?.percent ?? 0}%` }}
                />
              </div>
              <span className="text-xs text-[#ece7de]">{discovery?.percent ?? 0}%</span>
            </div>

            <ul className="space-y-1">
              {(discovery?.checklist ?? []).map((step) => (
                <li key={step.key} className="flex items-center gap-2 text-xs">
                  <span className={step.met ? 'text-[#5aa578]' : 'text-[#8f959b]'}>
                    {step.met ? '✓' : '○'}
                  </span>
                  <span className={step.met ? 'text-[#ece7de]' : 'text-[#9aa0a6]'}>{step.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bf-panel-section">
          <p className="bf-section-label">Open questions</p>
          <div className="bf-panel-card">
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

        <div className="bf-panel-section">
          <p className="bf-section-label">Milestones</p>
          <div className="bf-panel-card">
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
                <p className="mt-2 text-[10px] uppercase tracking-[0.15em] text-[#8f959b]">
                  AI-suggested · not final
                </p>
              </>
            ) : (
              <p className="text-sm text-[#9aa0a6]">Not drafted yet.</p>
            )}
          </div>
        </div>

        <div className="bf-panel-section">
           <p className="bf-section-label">Tasks</p>
          {taskProgress && state ? (
            <div className="mb-3 bf-panel-card bf-panel-card-emphasis">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#ece7de]">Delivery progress</span>
                <span className="text-[#5aa578]">{taskProgress.done}/{taskProgress.total} complete</span>
              </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#5aa578] transition-[width]" style={{ width: `${taskProgress.percent}%` }} />
                </div>
              <p className="mt-1 text-[10px] text-[#9aa0a6]">{taskProgress.inProgress} in progress · {taskProgress.review} awaiting review · {taskProgress.queued} queued{taskProgress.overdue ? ` · ${taskProgress.overdue} overdue` : ''}</p>
              {describeNextDeliveryAction(state.tasks)}
            </div>
          ) : null}
          <div className="bf-panel-card">
            {state && state.tasks.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-xs text-[#ece7de]">
                  {state.tasks.length} tasks · {taskProgress?.done ?? 0}/{taskProgress?.total ?? 0} complete
                </summary>
                <ul className="mt-2 space-y-2">
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
                        {shortDate(task.dueDate) ? ` · due ${shortDate(task.dueDate)}` : ''}
                        {isTaskOverdue(task) ? ' · OVERDUE' : ''}
                      </p>
                      {isStaff ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <select
                            aria-label={`Assign ${task.title}`}
                            value=""
                            disabled={taskControlsDisabled(task.id) || participants.length === 0}
                            onChange={(event) => {
                              if (event.target.value) {
                                runTaskAction(task.id, {
                                  action: 'assign',
                                  assigneeId: event.target.value,
                                });
                              }
                            }}
                            className="max-w-full rounded-lg border border-white/10 bg-[#14171a] px-2 py-1 text-[10px] text-[#ece7de] outline-none disabled:opacity-60"
                          >
                            <option value="">{task.assigneeName ? 'Reassign…' : 'Assign…'}</option>
                            {participants.map((participant) => (
                              <option key={participant.userId} value={participant.userId}>
                                {participant.displayName}
                                {participant.role === 'founder' ? ' (founder)' : ''}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            aria-label={`Due date for ${task.title}`}
                            defaultValue={shortDate(task.dueDate) ?? ''}
                            disabled={taskControlsDisabled(task.id)}
                            onChange={(event) => {
                              runTaskAction(task.id, {
                                action: 'schedule',
                                dueDate: event.target.value ? event.target.value : null,
                              });
                            }}
                            className="rounded-lg border border-white/10 bg-[#14171a] px-2 py-1 text-[10px] text-[#ece7de] outline-none disabled:opacity-60"
                          />
                        </div>
                      ) : null}
                      {task.status === 'REVIEW' && !isStaff ? (
                        <div className="mt-1.5 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => runTaskAction(task.id, { action: 'advance' })}
                            disabled={taskControlsDisabled(task.id)}
                            className="rounded-lg bg-[#5aa578] px-2 py-1 text-[10px] font-semibold text-[#14171a] transition hover:opacity-95 disabled:opacity-60"
                          >
                            Approve
                          </button>
                        </div>
                      ) : null}
                      {task.status === 'REVIEW' && isStaff ? (
                        <div className="mt-1.5 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => runTaskAction(task.id, { action: 'reopen' })}
                            disabled={taskControlsDisabled(task.id)}
                            className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-[#9aa0a6] transition hover:border-[#e8571e] disabled:opacity-60"
                          >
                            Send back
                          </button>
                        </div>
                      ) : null}
                      {isStaff && (task.status === 'TODO' || task.status === 'IN_PROGRESS') ? (
                        <div className="mt-1.5 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => runTaskAction(task.id, { action: 'advance' })}
                            disabled={taskControlsDisabled(task.id)}
                            className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-[#ece7de] transition hover:border-[#e8571e] disabled:opacity-60"
                          >
                            {task.status === 'TODO' ? 'Start work' : 'Submit for review'}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                </ul>
              </details>
            ) : (
              <p className="text-sm text-[#9aa0a6]">No tasks yet.</p>
            )}
          </div>
        </div>

        <div className="bf-panel-section">
          <p className="bf-section-label">AI estimate</p>
          <div className="bf-panel-card">
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

        {proposal && !isStaff ? (
          <div className="mb-6 rounded-xl border border-[#e8571e]/30 bg-[#1c2024] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">BrandForge proposal</p>
            <h3 className="mt-1 font-serif text-base text-[#ece7de]">{proposal.title}</h3>
            <p className="mt-2 text-lg tabular-nums text-[#ece7de]">
              {money(proposal.total_amount, proposal.currency)}
              <span className="ml-2 align-middle text-xs font-normal text-[#9aa0a6]">
                {proposal.estimated_weeks_min ?? '?'}–{proposal.estimated_weeks_max ?? '?'} weeks
              </span>
            </p>
            <p className="mt-1 text-xs text-[#b8763b]">{describeProposalStatus(proposal.status)}</p>
            {typeof proposal.counter_round === 'number' && proposal.counter_round >= 1 ? (
              <p className="mt-1 text-[11px] text-[#f6d6c3]">
                {proposal.counter_round === 1 ? 'Your counter' : 'Final offer from the specialist'}
                {' · '}
                {money(proposal.counter_total_amount, proposal.currency)}
                {' · '}
                {proposal.counter_weeks_min ?? '?'}–{proposal.counter_weeks_max ?? '?'} weeks
              </p>
            ) : null}
            {proposal.status === 'pending' || proposal.status === 'countered' || proposal.status === 'counter_back' ? (
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full rounded-lg border border-[#e8571e]/40 px-3 py-2 text-xs font-semibold text-[#f6d6c3] transition hover:border-[#e8571e]"
              >
                {proposal.status === 'counter_back'
                  ? 'Answer the counter in chat'
                  : proposal.status === 'countered'
                    ? 'View in chat'
                    : 'Review and answer in chat'}
              </button>
            ) : null}
          </div>
        ) : null}

        {agreement ? (
          <div className="mb-6 rounded-xl border border-white/10 bg-[#1c2024] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Agreement</p>
            <p className="mt-1 text-sm text-[#ece7de]">
              {money(agreement.total_amount, agreement.currency)} · {describeAgreementStatus(agreement.status)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[#9aa0a6]">{agreement.terms}</p>

            {payments.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {payments.map((payment) => (
                  <li key={payment.id} className="text-xs text-[#9aa0a6]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {payment.sequence}. {payment.title}
                      </span>
                      <span className="ml-2 whitespace-nowrap text-[#ece7de]">
                        {money(payment.amount, payment.currency)} · {describePaymentStatus(payment.status)}
                      </span>
                    </div>
                    {payment.tx_hash ? (
                      <p className="mt-0.5 truncate text-[10px] text-[#8f959b]">
                        tx {shortHash(payment.tx_hash)}
                        {payment.network ? ` · ${payment.network}` : ''}
                      </p>
                    ) : null}
                    {isStaff && payment.status === 'paid' ? (
                      <button
                        type="button"
                        onClick={() => onPaymentAction({ action: 'release', paymentId: payment.id })}
                        disabled={busyAction !== null}
                        className="mt-1 rounded-md border border-[#5aa578]/40 px-2 py-1 text-[10px] font-semibold text-[#5aa578] transition hover:bg-[#5aa578]/10 disabled:opacity-60"
                      >
                        {busyAction === `release-${payment.id}` ? 'Releasing…' : 'Release to operator'}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {agreement.status === 'pending_funding' && fundingSubmitted ? (
              <div className="mt-3 rounded-lg border border-[#b8763b]/30 bg-[#b8763b]/5 p-3">
                <p className="text-xs font-semibold text-[#ece7de]">
                  Payment submitted — verification in progress
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#9aa0a6]">
                  BrandForge is confirming your transfer
                  {submittedNetwork ? ` on ${submittedNetwork}` : ''} on-chain. The project moves to
                  delivery as soon as it is verified.
                </p>
                {submittedTx ? (
                  <p className="mt-1 flex items-center gap-2 break-all font-mono text-[10px] text-[#8f959b]">
                    <span className="min-w-0 flex-1 truncate">{submittedTx}</span>
                    <button
                      type="button"
                      onClick={() => copyText(submittedTx, setTxCopied)}
                      className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-[#9aa0a6] transition hover:border-[#e8571e] hover:text-[#ece7de]"
                    >
                      {txCopied ? 'Copied' : 'Copy'}
                    </button>
                  </p>
                ) : null}
                {isStaff ? (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => onPaymentAction({ action: 'verify' })}
                      disabled={busyAction !== null}
                      className="w-full rounded-lg bg-[#5aa578] px-3 py-2 text-xs font-semibold text-[#14171a] transition hover:opacity-95 disabled:opacity-60"
                    >
                      {busyAction === 'verify' ? 'Verifying…' : 'Verify on-chain and mark funded'}
                    </button>
                    <input
                      type="text"
                      value={rejectNote}
                      aria-label="Reason for rejecting the transfer"
                      onChange={(event) => setRejectNote(event.target.value)}
                      placeholder="Reason if the transfer does not check out"
                      className="w-full rounded-md border border-white/10 bg-[#14171a] px-2 py-1.5 text-[11px] text-[#ece7de] outline-none transition placeholder:text-[#8f959b] focus:border-red-500/50"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onPaymentAction({ action: 'reject', note: rejectNote.trim() || undefined })
                      }
                      disabled={busyAction !== null}
                      className="w-full rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-200 transition hover:bg-red-500/10 disabled:opacity-60"
                    >
                      {busyAction === 'reject' ? 'Rejecting…' : 'Reject submission'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {agreement.status === 'pending_funding' && !fundingSubmitted ? (
              <div className="mt-3 rounded-lg border border-[#e8571e]/30 bg-[#e8571e]/5 p-3">
                <p className="text-xs font-semibold text-[#ece7de]">Fund in crypto</p>
                <p className="mt-1 text-xs leading-relaxed text-[#9aa0a6]">
                  Send {money(agreement.total_amount, agreement.currency)} in crypto to the
                  BrandForge deposit wallet. The funds are held until you approve each milestone.
                </p>
                {depositWallet ? (
                  <div className="mt-2 rounded-md bg-[#14171a] px-2 py-1.5">
                    {depositNetwork ? (
                      <p className="text-[10px] uppercase tracking-[0.15em] text-[#b8763b]">
                        {depositNetwork}
                      </p>
                    ) : null}
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 break-all font-mono text-[11px] text-[#ece7de]">{depositWallet}</p>
                      <button
                        type="button"
                        onClick={() => copyText(depositWallet, setWalletCopied)}
                        className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-[#9aa0a6] transition hover:border-[#e8571e] hover:text-[#ece7de]"
                      >
                        {walletCopied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[#9aa0a6]">
                    Deposit details are shared in this chat.
                  </p>
                )}
                <form
                  className="mt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const trimmed = txInput.trim();
                    if (trimmed) {
                      onSubmitPayment(trimmed);
                    }
                  }}
                >
                  <label
                    htmlFor="tx-hash-input"
                    className="text-[10px] uppercase tracking-[0.15em] text-[#9aa0a6]"
                  >
                    Transaction hash after sending
                  </label>
                  <input
                    id="tx-hash-input"
                    type="text"
                    value={txInput}
                    onChange={(event) => setTxInput(event.target.value)}
                    placeholder="Paste the transaction hash"
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#14171a] px-2 py-1.5 font-mono text-[11px] text-[#ece7de] outline-none transition placeholder:text-[#8f959b] focus:border-[#e8571e]"
                  />
                  <button
                    type="submit"
                    disabled={busyAction !== null || !txInput.trim()}
                    className="mt-2 w-full rounded-lg bg-[#e8571e] px-3 py-2 text-xs font-semibold text-[#14171a] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyAction === 'fund' ? 'Submitting…' : 'Submit payment for verification'}
                  </button>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-[#8f959b]">
                    BrandForge verifies the transfer on-chain before marking the project funded.
                  </p>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}

        {canRequestReview ? (
          <button
            type="button"
            onClick={onRequestReview}
            disabled={busyAction !== null}
            className="bf-action bf-action-primary w-full"
          >
            {busyAction === 'review' ? 'Sending…' : 'Send to BrandForge review'}
          </button>
        ) : null}

        <div className="bf-panel-section">
          <p className="bf-section-label">Talk to humans</p>
          <div className="bf-panel-card">
            <ul className="space-y-1.5">
              {[COMMUNITY_LINKS.discord, COMMUNITY_LINKS.telegramGroup, COMMUNITY_LINKS.telegramChannel].map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-[#ece7de] transition hover:text-[#e8571e]"
                  >
                    {link.label}
                    <span className="block text-[10px] font-normal text-[#9aa0a6]">{link.description}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
          </div>
        </details>
      </div>
    </aside>
  );
}
