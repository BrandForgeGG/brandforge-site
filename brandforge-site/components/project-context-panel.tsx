'use client';

import { useEffect, useRef, useState } from 'react';
import { getNextDeliveryTask, summarizeTaskProgress } from '@/lib/task-board';
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
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'scheduled',
  pending: 'verifying',
  paid: 'held by BrandForge',
  released: 'released',
  failed: 'failed',
};

function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

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
  onClose,
  onRequestReview,
  onProposalAction,
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
  onClose: () => void;
  onRequestReview: () => void;
  onProposalAction: (action: 'accept' | 'decline' | 'request_changes') => void;
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
    busyAction !== null || (taskBusyId !== null && taskBusyId !== `task-${taskId}`);
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
  const submittedNetwork = payments.find((payment) => payment.network)?.network ?? null;

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
          {state ? (() => {
            const progress = summarizeTaskProgress(state.tasks);
            const nextTask = getNextDeliveryTask(state.tasks);
            return (
              <div className="mb-3 rounded-xl border border-[#5aa578]/25 bg-[#1c2024] px-3 py-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#ece7de]">Delivery progress</span>
                  <span className="text-[#5aa578]">{progress.done}/{progress.total} complete</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#5aa578] transition-all" style={{ width: `${progress.percent}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-[#9aa0a6]">{progress.inProgress} in progress · {progress.review} awaiting review · {progress.queued} queued</p>
                {nextTask ? <p className="mt-2 border-t border-white/10 pt-2 text-[10px] text-[#b8763b]">Next: {nextTask.title}{nextTask.assigneeName ? ` · ${nextTask.assigneeName}` : ''}</p> : <p className="mt-2 border-t border-white/10 pt-2 text-[10px] text-[#5aa578]">All planned delivery tasks are complete.</p>}
              </div>
            );
          })() : null}
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
                        {shortDate(task.dueDate) ? ` · due ${shortDate(task.dueDate)}` : ''}
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
                      {task.status === 'REVIEW' ? (
                        <div className="mt-1.5 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => runTaskAction(task.id, { status: 'DONE' })}
                            disabled={taskControlsDisabled(task.id)}
                            className="rounded-lg bg-[#5aa578] px-2 py-1 text-[10px] font-semibold text-[#14171a] transition hover:opacity-95 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => runTaskAction(task.id, { status: 'IN_PROGRESS' })}
                            disabled={taskControlsDisabled(task.id)}
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

        {proposal && proposal.status === 'pending' && !isStaff ? (
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
                  <li key={payment.id} className="text-xs text-[#9aa0a6]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {payment.sequence}. {payment.title}
                      </span>
                      <span className="ml-2 whitespace-nowrap text-[#ece7de]">
                        {money(payment.amount, payment.currency)} · {paymentStatusLabel(payment.status)}
                      </span>
                    </div>
                    {payment.tx_hash ? (
                      <p className="mt-0.5 truncate text-[10px] text-[#6f757b]">
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
                  <p className="mt-1 break-all font-mono text-[10px] text-[#6f757b]">{submittedTx}</p>
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
                      onChange={(event) => setRejectNote(event.target.value)}
                      placeholder="Reason if the transfer does not check out"
                      className="w-full rounded-md border border-white/10 bg-[#14171a] px-2 py-1.5 text-[11px] text-[#ece7de] outline-none transition placeholder:text-[#6f757b] focus:border-red-500/50"
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
                    <p className="break-all font-mono text-[11px] text-[#ece7de]">{depositWallet}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[#9aa0a6]">
                    Deposit details are shared by the BrandForge team in this chat.
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
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#14171a] px-2 py-1.5 font-mono text-[11px] text-[#ece7de] outline-none transition placeholder:text-[#6f757b] focus:border-[#e8571e]"
                  />
                  <button
                    type="submit"
                    disabled={busyAction !== null || !txInput.trim()}
                    className="mt-2 w-full rounded-lg bg-[#e8571e] px-3 py-2 text-xs font-semibold text-[#14171a] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyAction === 'fund' ? 'Submitting…' : 'Submit payment for verification'}
                  </button>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-[#6f757b]">
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
            className="w-full rounded-xl bg-[#e8571e] px-4 py-3 text-sm font-semibold text-[#14171a] transition hover:opacity-95 disabled:opacity-60"
          >
            {busyAction === 'review' ? 'Sending…' : 'Send to BrandForge review'}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
