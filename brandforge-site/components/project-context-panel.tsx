'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnswerOutline } from '@/lib/deliverable-outline';
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
  outline,
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
  // Structure of the latest AI answer, computed client-side so the panel mirrors the chat live.
  outline?: AnswerOutline | null;
  proposal: ProposalSummary | null;
  agreement: AgreementSummary | null;
  payments: PaymentSummary[];
  busyAction: string | null;
  isStaff: boolean;
  participants: TaskParticipant[];
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

  const depositWallet = process.env.NEXT_PUBLIC_DEPOSIT_WALLET_ADDRESS ?? '';
  const depositNetwork = process.env.NEXT_PUBLIC_DEPOSIT_NETWORK ?? '';

  const fundingSubmitted =
    payments.length > 0 && payments.every((payment) => payment.status !== 'scheduled');
  const submittedTx = payments.find((payment) => payment.tx_hash)?.tx_hash ?? null;
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const openDetails = () => {
    setDetailsOpen(true);
    const node = detailsRef.current;
    if (!node) return;
    if (!node.open) node.setAttribute('open', '');
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    node.focus?.();
  };

  const projectPulse = buildProjectPulse({ state, proposal, agreement, tasks: state?.tasks ?? [] });
  const taskProgress = state ? summarizeTaskProgress(state.tasks) : null;

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

  const nextDeliveryRaw = describeNextDeliveryAction(state?.tasks ?? []);
  const nextDelivery = nextDeliveryRaw.startsWith('Next: ')
    ? nextDeliveryRaw.slice('Next: '.length)
    : nextDeliveryRaw === 'No delivery tasks are planned yet.'
      ? null
      : nextDeliveryRaw;
  const nextDiscoveryStep = (discovery?.checklist ?? []).find((step) => !step.met)?.label ?? null;
  const nextStepLabel =
    nextDelivery ?? nextDiscoveryStep ?? 'Describe your project in the chat to get started';

  const haveItems: string[] = [];
  if (files.length > 0) haveItems.push(`${files.length} file${files.length === 1 ? '' : 's'}`);
  if (state && state.requirementsCount > 0) haveItems.push(`${state.requirementsCount} requirement${state.requirementsCount === 1 ? '' : 's'}`);
  if (state && state.openQuestions.length > 0) haveItems.push(`${state.openQuestions.length} open question${state.openQuestions.length === 1 ? '' : 's'}`);
  if (state && state.milestones.length > 0) haveItems.push(`${state.milestones.length} milestone${state.milestones.length === 1 ? '' : 's'}`);
  if (state && state.tasks.length > 0) haveItems.push(`${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'}`);
  if (proposal) haveItems.push('proposal');
  if (agreement) haveItems.push('agreement');

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-[85vw] shrink-0 flex-col border-l border-line bg-deep shadow-2xl xl:sticky xl:top-0 xl:z-auto xl:h-screen xl:max-w-none xl:shadow-none">
      <div className="bf-panel-header flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-copper">Project</p>
          <h2 className="mt-1 truncate font-serif text-lg text-foreground">
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
          <p className="bf-section-label">Goal</p>
          <p className="text-sm leading-relaxed text-foreground">
            {state?.project.problemStatement || outline?.goal || 'Define what you want to achieve in the chat.'}
          </p>
        </div>

        <div className="bf-panel-section">
          <p className="bf-section-label">We have</p>
          <div className="bf-panel-card">
            {haveItems.length > 0 ? (
              <p className="text-xs leading-relaxed text-muted">
                {haveItems.join(' · ')}
              </p>
            ) : outline && outline.sections.length === 0 ? (
              <p className="text-xs text-muted">Working on it in the chat.</p>
            ) : !outline ? (
              <p className="text-xs text-muted">Nothing yet — start the conversation.</p>
            ) : null}
          </div>
        </div>

        {outline && outline.sections.length > 0 ? (
          <div className="bf-panel-section">
            <p className="bf-section-label">Latest answer</p>
            {outline.assumptions ? (
              <p className="mb-2 text-xs leading-relaxed text-muted">Assuming: {outline.assumptions.replace(/^Assuming:?\s*/i, '')}</p>
            ) : null}
            <ul className="bf-panel-card space-y-1.5">
              {outline.sections.map((section) => (
                <li key={section.title} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-foreground">{section.title}</span>
                  {section.items > 0 ? <span className="shrink-0 text-muted">{section.items}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="bf-panel-section">
          <p className="bf-section-label">Next</p>
          <div className="bf-panel-card bf-panel-card-emphasis">
            <p className="text-sm leading-relaxed text-foreground">{nextStepLabel}</p>
          </div>
        </div>

        {taskProgress && state ? (
          <div className="bf-panel-section">
            <p className="bf-section-label">Progress</p>
            <div className="bf-panel-card">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground">Tasks</span>
                <span className="text-trust">{taskProgress.done}/{taskProgress.total}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-overlay">
                <div className="h-full rounded-full bg-trust transition-[width]" style={{ width: `${taskProgress.percent}%` }} />
              </div>
            </div>
          </div>
        ) : null}

        {state && state.estimate ? (
          <div className="bf-panel-section">
            <p className="bf-section-label">Estimate</p>
            <div className="bf-panel-card">
              <p className="text-xs text-copper">AI-generated · not final</p>
              <p className="mt-1 text-sm text-foreground">
                {money(state.estimate.costMin, state.estimate.currency)}–{money(state.estimate.costMax, state.estimate.currency)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {state.estimate.weeksMin ?? '?'}–{state.estimate.weeksMax ?? '?'} weeks
              </p>
            </div>
          </div>
        ) : null}

        {proposal && !isStaff ? (
          <div className="bf-panel-section">
            <p className="bf-section-label">Proposal</p>
            <div className="bf-panel-card">
              <p className="text-sm text-foreground">{proposal.title}</p>
              <p className="mt-1 text-lg tabular-nums text-foreground">
                {money(proposal.total_amount, proposal.currency)}
                <span className="ml-2 align-middle text-xs font-normal text-muted">
                  {proposal.estimated_weeks_min ?? '?'}–{proposal.estimated_weeks_max ?? '?'} weeks
                </span>
              </p>
              <p className="mt-1 text-xs text-copper">{describeProposalStatus(proposal.status)}</p>
              {typeof proposal.counter_round === 'number' && proposal.counter_round >= 1 ? (
                <p className="mt-1 text-[11px] text-ember-light">
                  {proposal.counter_round === 1 ? 'Your counter' : 'Final offer'}
                  {' · '}
                  {money(proposal.counter_total_amount, proposal.currency)}
                </p>
              ) : null}
              {proposal.status === 'pending' || proposal.status === 'countered' || proposal.status === 'counter_back' ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-3 w-full rounded-lg border border-ember/40 px-3 py-2 text-xs font-semibold text-ember-light transition hover:border-ember"
                >
                  {proposal.status === 'counter_back'
                    ? 'Answer in chat'
                    : proposal.status === 'countered'
                      ? 'View in chat'
                      : 'Review in chat'}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {agreement ? (
          <div className="bf-panel-section">
            <p className="bf-section-label">Agreement</p>
            <div className="bf-panel-card">
              <p className="text-sm text-foreground">
                {money(agreement.total_amount, agreement.currency)} · {describeAgreementStatus(agreement.status)}
              </p>
              {payments.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {payments.map((payment) => (
                    <li key={payment.id} className="text-xs text-muted">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{payment.sequence}. {payment.title}</span>
                        <span className="ml-2 whitespace-nowrap text-foreground">
                          {money(payment.amount, payment.currency)} · {describePaymentStatus(payment.status)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
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
          <p className="bf-section-label">Team</p>
          <div className="bf-panel-card">
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <span className="bf-stack-item bf-stack-ai" aria-hidden="true">B</span>
                <span className="text-xs text-foreground">BrandForge AI</span>
              </li>
              {participants.map((person) => (
                <li key={person.userId} className="flex items-center gap-2">
                  <span className="bf-stack-item" style={avatarTone(person.userId)} aria-hidden="true">
                    {initialsFor(person.displayName)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-foreground">{person.displayName}</span>
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-muted">{formatRole(person.role)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </aside>
  );
}
