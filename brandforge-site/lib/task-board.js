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
        (participant?.role === 'founder' ? 'Founder' : 'BrandForge team'),
      role: String(participant?.role ?? ''),
    }))
    .filter((participant) => participant.userId);
}
