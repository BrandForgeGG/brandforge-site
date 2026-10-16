import { getRetainer } from '@/lib/plans.js';
import { addSystemLine, getChatTaskStamps, insertPlanTasks } from '@/lib/project-db';
import { currentMonth, monthTasks } from '@/lib/plan-month.js';

// One paid month of a team plan: the month's work list lands in the client's chat (the tasks panel), and one line says so.
// Months count up from the work list itself. Returns the month started, or 0 when nothing new started (unknown plan, or
// the same payment arriving twice). `intro` (given the month number) is posted first, so the chat reads "Paid…" then the list.
export async function startPlanMonth(conversationId: string, planId: string, intro?: (month: number) => string): Promise<number> {
  const plan = getRetainer(planId);
  if (!plan) return 0;
  const rows = await getChatTaskStamps(conversationId);
  const now = currentMonth(rows.map((row) => row.title));
  // A month started in the last 20 hours is the same payment arriving twice.
  const latest = rows.filter((row) => row.title.startsWith(`Month ${now}: `)).map((row) => Date.parse(row.created_at)).sort().pop();
  if (now > 0 && latest && Date.now() - latest < 20 * 3_600_000) return 0;
  const month = now + 1;
  const ok = await insertPlanTasks(monthTasks(plan.id, month).map((task) => ({ ...task, conversation_id: conversationId, status: 'TODO' })));
  if (!ok) return 0;
  if (intro) await addSystemLine(conversationId, intro(month));
  await addSystemLine(conversationId, `Month ${month} work list is in: ${plan.deliverables.join(', ')}.`);
  return month;
}
