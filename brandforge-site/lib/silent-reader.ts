import { TOOLS } from '@/lib/ai-service';
import { executeTool, type ToolContext } from '@/lib/ai-tools';
import { buildStateBlock, getConversationSnapshot } from '@/lib/conversation-state';
import { getAiUsageToday, getMessages } from '@/lib/project-db';
import { budgetLimits, decideBudget } from '@/lib/ai-budget.js';
import { screenText } from '@/lib/content-policy.js';

// While the AI is paused it does not answer, but it still reads along so the project panel on the right keeps
// filling in (the goal, who it is for, requirements, open questions). Nothing is written to the chat: only the
// panel's own notes change. Best effort, token-capped, and it stops quietly at the daily AI ceiling.
const NOTE_TOOLS = new Set(['update_project_context', 'add_requirement', 'add_open_question']);

export async function readChatSilently(conversationId: string, context: ToolContext = {}): Promise<number> {
  const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
  if (!apiKey) return 0;
  const usage = await getAiUsageToday(null).catch(() => ({ userToday: 0, aiToday: 0 }));
  if (!decideBudget({ userToday: 0, aiToday: usage.aiToday }, budgetLimits(process.env)).allowed) return 0;

  const [snapshot, history] = await Promise.all([getConversationSnapshot(conversationId), getMessages(conversationId, { limit: 8, includeDeleted: false })]);
  if (!snapshot) return 0;
  const transcript = history
    .filter((entry) => !entry.deleted_at && entry.content_type !== 'system' && entry.content_type !== 'ai_draft')
    .slice(-6)
    .map((entry) => `${entry.sender_type === 'ai' ? 'AI' : entry.sender_name || 'Person'}: ${entry.content.slice(0, 600)}`)
    .join('\n');
  if (!screenText(transcript).ok) return 0;

  const tools = TOOLS.filter((tool) => NOTE_TOOLS.has(tool.name)).map((tool) => ({ type: 'function' as const, function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 500,
        tools,
        tool_choice: 'auto',
        messages: [
          {
            role: 'system',
            content: `You are quietly reading a project chat in which the AI has been paused. Do NOT write a reply. Only keep the project notes up to date by calling tools for NEW facts the people stated (project name, the problem, who it is for, platforms, requirements they asked for, open questions that block the scope). Never invent anything, never repeat what is already recorded, and call no tool if there is nothing new.\n\n${buildStateBlock(snapshot)}`,
          },
          { role: 'user', content: `Recent messages:\n${transcript}` },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { choices?: { message?: { tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] } }[] };
    const calls = (data.choices?.[0]?.message?.tool_calls ?? []).filter((call) => NOTE_TOOLS.has(call.function.name)).slice(0, 6);
    for (const call of calls) await executeTool(conversationId, call, context);
    return calls.length;
  } catch (cause) {
    console.warn('silent read skipped:', cause instanceof Error ? cause.message.slice(0, 120) : cause);
    return 0;
  }
}
