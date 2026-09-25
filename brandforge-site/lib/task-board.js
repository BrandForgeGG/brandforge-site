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
