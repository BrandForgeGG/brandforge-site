import { getRetainer } from '@/lib/plans.js';
import { addSystemLine, getChatMonthLines } from '@/lib/project-db';
import { currentMonth, monthLines } from '@/lib/plan-month.js';

// One paid month of a team plan, in the client's chat: "Paid… Month N starts today." and how the plan works (add tasks,
// N at a time). Returns the month started, or 0 when nothing new started (unknown plan, or the same payment arriving twice
// within 20 hours).
export async function startPlanMonth(conversationId: string, planId: string): Promise<number> {
  const plan = getRetainer(planId);
  if (!plan) return 0;
  const lines = await getChatMonthLines(conversationId);
  const now = currentMonth(lines.map((line) => line.content));
  const latest = lines.filter((line) => line.content.includes(`Month ${now} starts today`)).map((line) => Date.parse(line.created_at)).sort().pop();
  if (now > 0 && latest && Date.now() - latest < 20 * 3_600_000) return 0;
  const month = now + 1;
  for (const line of monthLines(plan, month, month > 1)) await addSystemLine(conversationId, line);
  return month;
}
