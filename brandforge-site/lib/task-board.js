// Task-board depth: pure helpers for PATCH /api/chat-tasks (due dates + assignee roster).
// Kept dependency-free so node:test can cover them without Supabase.

// Accepts the <input type="date"> value (YYYY-MM-DD) or a clear (null/undefined/'').
// Stores midnight UTC so every viewer sees the same calendar day.
export function normalizeTaskDueDate(value) {
  if (value === null || value === undefined || value === '') {
    return { ok: true, iso: null };
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false };
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return { ok: false };
  }

  return { ok: true, iso: parsed.toISOString() };
}

// Shapes participants rows into the assignee-picker roster. Only rows with a user id survive;
// a blank display name falls back to a role label so the picker never shows an empty option.
export function shapeTaskRoster(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((participant) => ({
      userId: String(participant?.user_id ?? ''),
      displayName:
        String(participant?.display_name ?? '').trim() ||
        (participant?.role === 'founder' ? 'Founder' : String(participant?.user_id ?? '').slice(0, 8) || 'Specialist'),
      role: String(participant?.role ?? ''),
      avatarUrl: typeof participant?.avatar_url === 'string' && participant.avatar_url ? participant.avatar_url : null,
    }))
    .filter((participant) => participant.userId);
}

export function isTaskOverdue(task, today = new Date()) {
  if (!task || task.status === 'DONE' || !task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const endOfDueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate(), 23, 59, 59, 999);
  return endOfDueDay < today.getTime();
}

/** @returns {{ total: number; done: number; inProgress: number; review: number; queued: number; overdue: number; percent: number }} */
export function summarizeTaskProgress(tasks, today = new Date()) {
  const rows = Array.isArray(tasks) ? tasks : [];
  const counts = { total: rows.length, done: 0, inProgress: 0, review: 0, queued: 0, overdue: 0, percent: 0 };
  for (const task of rows) {
    if (task?.status === 'DONE') counts.done += 1;
    else if (task?.status === 'REVIEW') counts.review += 1;
    else if (task?.status === 'IN_PROGRESS') counts.inProgress += 1;
    else counts.queued += 1;
    if (isTaskOverdue(task, today)) counts.overdue += 1;
  }
  counts.percent = counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100);
  return counts;
}

export function getNextDeliveryTask(tasks) {
  if (!Array.isArray(tasks)) return null;
  const priority = { REVIEW: 0, IN_PROGRESS: 1, TODO: 2 };
  return tasks
    .filter((task) => priority[task?.status] !== undefined)
    .sort((a, b) => priority[a.status] - priority[b.status])[0] ?? null;
}

export function describeAgreementStatus(status) {
  const labels = {
    pending_funding: 'Awaiting funding — submit the transaction hash after sending funds',
    funded: 'Funded — BrandForge is holding the funds while delivery continues',
    active: 'In delivery — review work as it is submitted',
    completed: 'Completed — all agreed delivery work is done',
    cancelled: 'Cancelled — the agreement is no longer active',
  };
  return labels[status] ?? 'Agreement status unavailable.';
}

export function describeProposalStatus(status) {
  const labels = {
    pending: 'Awaiting your decision — review the scope and timeline before continuing.',
    changes_requested: 'Changes requested — BrandForge is revising the proposal in chat.',
    countered: 'Countered — the specialist is answering your counter offer.',
    counter_back: 'Counter-back received — accept it or decline. This is the final decision.',
    accepted: 'Accepted — the agreement and payment schedule are being prepared.',
    declined: 'Declined — you can return to chat if you want a new proposal.',
    expired: 'Expired — ask the team in chat for an updated proposal.',
  };
  return labels[status] ?? 'Proposal status unavailable.';
}

export function buildProjectPulse({ state, proposal, agreement, tasks } = {}) {
  const items = [];
  if (state) {
    items.push({ key: 'status', label: 'Project state', value: state.status === 'DISCOVERY' ? 'Shaping the brief' : 'In delivery' });
  }
  if (tasks && typeof tasks === 'object') {
    const action = describeNextDeliveryAction(tasks);
    if (action !== 'No delivery tasks are planned yet.') items.push({ key: 'next', label: 'Next delivery action', value: action.replace(/^Next: /, '') });
  }
  if (proposal?.status === 'pending') items.push({ key: 'proposal', label: 'Decision', value: 'Review the proposal in this panel' });
  if (proposal?.status === 'counter_back') items.push({ key: 'proposal', label: 'Decision', value: 'Answer the counter offer in this panel' });
  if (agreement?.status === 'pending_funding') items.push({ key: 'funding', label: 'Funding', value: 'Submit the transaction hash for verification' });
  if (state?.openQuestions?.length) items.push({ key: 'questions', label: 'Open questions', value: `${state.openQuestions.length} need an answer` });
  return items.slice(0, 5);
}

export function describePaymentStatus(status) {
  const labels = {
    scheduled: 'Scheduled — submit your transaction hash after funding',
    pending: 'Verifying — BrandForge is checking the transfer',
    paid: 'Held by BrandForge — delivery can continue',
    released: 'Released to the specialist',
    failed: 'Not verified — check the transaction and resubmit',
  };
  return labels[status] ?? 'Payment status unavailable';
}

export function describeNextDeliveryAction(tasks) {
  const next = getNextDeliveryTask(tasks);
  if (!next) return 'No delivery tasks are planned yet.';
  const owner = next.assigneeName ? ` · ${next.assigneeName}` : ' · unassigned';
  if (next.status === 'REVIEW') return `Next: review ${next.title}${owner}.`;
  if (next.status === 'IN_PROGRESS') return `Next: continue ${next.title}${owner}.`;
  return `Next: start ${next.title}${owner}.`;
}
