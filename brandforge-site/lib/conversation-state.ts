// Server-side composition of the project state that both the chat API and the right
// sidebar read from. Nothing here invents data: every field comes from a persisted row.

import {
  getConversation,
  getConversationTasks,
  getMilestones,
  getProjectContext,
  getRequirements,
  updateProjectContext,
  type Milestone,
  type ProjectContext,
  type Requirement,
  type Task,
} from './project-db';
import { computeDiscovery } from './discovery';

export interface DiscoveryState {
  completeness: number;
  percent: number;
  checklist: { key: string; label: string; met: boolean; weight: number }[];
  missing: string[];
}

export interface ConversationSnapshot {
  conversationId: string;
  title: string;
  status: string;
  context: ProjectContext | null;
  requirements: Requirement[];
  openQuestions: Requirement[];
  milestones: Milestone[];
  tasks: Task[];
  discovery: DiscoveryState;
}

function truncate(value: unknown, maxLength: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function isOpenQuestion(requirement: Requirement): boolean {
  return (
    requirement.category === 'open_question' &&
    requirement.status !== 'resolved' &&
    requirement.status !== 'rejected'
  );
}

export function findOpenQuestions(requirements: Requirement[]): Requirement[] {
  return requirements.filter(isOpenQuestion);
}

export async function getConversationSnapshot(
  conversationId: string,
  options: { asStaff?: boolean } = {}
): Promise<ConversationSnapshot | null> {
  const conversation = await getConversation(conversationId);

  if (!conversation) {
    return null;
  }

  // Staff read the founder-scoped tables (requirements, milestones) with the service role: RLS only
  // grants staff conversations, messages, project_context and tasks.
  const [context, requirements, milestones, tasks] = await Promise.all([
    getProjectContext(conversationId),
    getRequirements(conversationId, options.asStaff),
    getMilestones(conversationId, options.asStaff),
    getConversationTasks(conversationId),
  ]);

  return {
    conversationId,
    title: String(conversation.title ?? 'New Project'),
    status: String(conversation.status ?? 'DISCOVERY'),
    context,
    requirements,
    openQuestions: findOpenQuestions(requirements),
    milestones,
    tasks,
    discovery: computeDiscovery(context, requirements),
  };
}

// Discovery completeness is recomputed from rows and stored, so the sidebar percentage can
// never drift from the database.
export async function syncDiscoveryCompleteness(
  conversationId: string,
  options: { asStaff?: boolean } = {}
): Promise<DiscoveryState> {
  const [context, requirements] = await Promise.all([
    getProjectContext(conversationId),
    getRequirements(conversationId, options.asStaff),
  ]);

  const discovery = computeDiscovery(context, requirements);

  // A staff view is read-only: persisting the recomputed value needs the founder's own session.
  if (options.asStaff) {
    return discovery;
  }

  const stored = Number(context?.discovery_completeness ?? -1);

  if (Math.abs(stored - discovery.completeness) > 0.001) {
    await updateProjectContext(conversationId, { discovery_completeness: discovery.completeness });
  }

  return discovery;
}

// The model receives the persisted state on every turn instead of trusting the transcript.
export function buildStateBlock(snapshot: ConversationSnapshot): string {
  const { context, requirements, openQuestions, milestones, tasks, discovery } = snapshot;
  const currency = context?.currency || 'EUR';

  const lines: string[] = [
    'CURRENT PROJECT STATE (read from the BrandForge database - this is the source of truth).',
    `Conversation status: ${snapshot.status}`,
    `Project name: ${truncate(context?.project_name, 120) || 'not captured yet'}`,
    `Problem: ${truncate(context?.problem_statement, 500) || 'not captured yet'}`,
    `Target users: ${(context?.target_users ?? []).join(', ') || 'not captured yet'}`,
    `Platforms: ${(context?.platforms ?? []).join(', ') || 'not captured yet'}`,
  ];

  if (context?.estimated_cost_min && context?.estimated_cost_max) {
    lines.push(
      `Stored AI estimate (not final): ${currency} ${context.estimated_cost_min}-${context.estimated_cost_max}, ` +
        `${context.estimated_weeks_min ?? '?'}-${context.estimated_weeks_max ?? '?'} weeks`
    );
  } else {
    lines.push('Stored AI estimate (not final): none yet');
  }

  lines.push(`Discovery: ${discovery.percent}% (${discovery.missing.length ? `missing: ${discovery.missing.join(', ')}` : 'nothing missing'})`);

  const listedRequirements = requirements.filter((requirement) => !isOpenQuestion(requirement)).slice(0, 40);
  lines.push(`Captured requirements (${listedRequirements.length}):`);
  lines.push(
    listedRequirements.length
      ? listedRequirements
          .map(
            (requirement) =>
              `- ${requirement.id} [${requirement.category}, ${requirement.priority}, ${requirement.status}] ${truncate(requirement.title, 140)}`
          )
          .join('\n')
      : '- none yet'
  );

  lines.push(`Open questions (${openQuestions.length}):`);
  lines.push(
    openQuestions.length
      ? openQuestions
          .map((question) => `- ${question.id} ${truncate(question.title, 160)}`)
          .join('\n')
      : '- none'
  );

  lines.push(`AI-suggested milestones (${milestones.length}, not final):`);
  lines.push(
    milestones.length
      ? milestones
          .map(
            (milestone) =>
              `- ${milestone.sequence}. ${truncate(milestone.title, 120)}` +
              (milestone.amount ? ` (${currency} ${milestone.amount})` : '') +
              (milestone.estimated_weeks ? ` (~${milestone.estimated_weeks}w)` : '')
          )
          .join('\n')
      : '- none yet'
  );

  lines.push(`Task list (${tasks.length}, AI drafts unless a human claimed them):`);
  lines.push(
    tasks.length
      ? tasks
          .map(
            (task) =>
              `- [${task.status ?? 'TODO'}] ${truncate(task.title, 140)}` +
              (task.assignee_name ? ` (owner: ${truncate(task.assignee_name, 60)})` : '')
          )
          .join('\n')
      : '- none yet — call set_project_tasks once scope is clear'
  );

  return lines.join('\n');
}

// The exact payload both /api/chat and /api/project-context return, so the chat page and the
// right sidebar render one shape that mirrors persisted rows.
export interface ClientProjectState {
  conversationId: string;
  title: string;
  status: string;
  project: {
    name: string | null;
    problemStatement: string | null;
    targetUsers: string[];
    platforms: string[];
  };
  requirementsCount: number;
  requirements: {
    id: string;
    title: string;
    category: string;
    priority: string;
    status: string;
  }[];
  openQuestions: { id: string; title: string; priority: string }[];
  milestones: {
    id: string;
    sequence: number;
    title: string;
    description: string | null;
    amount: number | null;
    currency: string | null;
    estimatedWeeks: number | null;
    status: string | null;
  }[];
  tasks: {
    id: string;
    title: string;
    description: string | null;
    assigneeName: string | null;
    status: string;
    milestoneId: string | null;
    dueDate: string | null;
  }[];
  estimate: {
    currency: string;
    costMin: number;
    costMax: number;
    weeksMin: number | null;
    weeksMax: number | null;
  } | null;
  discovery: DiscoveryState;
}

export function buildClientState(
  snapshot: ConversationSnapshot | null,
  discovery: DiscoveryState
): ClientProjectState | null {
  if (!snapshot) {
    return null;
  }

  const context = snapshot.context;
  const hasEstimate = Boolean(context?.estimated_cost_min && context?.estimated_cost_max);

  return {
    conversationId: snapshot.conversationId,
    title: snapshot.title,
    status: snapshot.status,
    project: {
      name: context?.project_name ?? null,
      problemStatement: context?.problem_statement ?? null,
      targetUsers: context?.target_users ?? [],
      platforms: context?.platforms ?? [],
    },
    requirementsCount: snapshot.requirements.filter(
      (requirement) => requirement.category !== 'open_question' && requirement.status !== 'rejected'
    ).length,
    requirements: snapshot.requirements
      .filter((requirement) => requirement.category !== 'open_question')
      .map((requirement) => ({
        id: String(requirement.id),
        title: requirement.title,
        category: requirement.category,
        priority: requirement.priority,
        status: requirement.status,
      })),
    openQuestions: snapshot.openQuestions.map((question) => ({
      id: String(question.id),
      title: question.title,
      priority: question.priority,
    })),
    milestones: snapshot.milestones.map((milestone) => ({
      id: String(milestone.id),
      sequence: milestone.sequence,
      title: milestone.title,
      description: milestone.description ?? null,
      amount: milestone.amount ?? null,
      currency: milestone.currency ?? null,
      estimatedWeeks: milestone.estimated_weeks ?? null,
      status: milestone.status ?? null,
    })),
    tasks: snapshot.tasks.map((task) => ({
      id: String(task.id),
      title: task.title,
      description: task.description ?? null,
      assigneeName: task.assignee_name ?? null,
      status: task.status ?? 'TODO',
      milestoneId: task.milestone_id ?? null,
      dueDate: task.due_date ?? null,
    })),
    estimate: hasEstimate
      ? {
          currency: context?.currency ?? 'EUR',
          costMin: Number(context?.estimated_cost_min),
          costMax: Number(context?.estimated_cost_max),
          weeksMin: context?.estimated_weeks_min ?? null,
          weeksMax: context?.estimated_weeks_max ?? null,
        }
      : null,
    discovery,
  };
}

