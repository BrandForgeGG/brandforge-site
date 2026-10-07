// Server-side validation and execution of BrandForge AI tool calls.
//
// The model only proposes: every field is validated here and written through the signed-in
// founder's Supabase session, so Postgres row level security still applies. When a write is
// rejected the model receives an error and nothing is reported to the founder as saved.

import type { ToolCall } from './ai-service';
import {
  addMessage,
  addOpenQuestion,
  countGeneratedImages,
  storeGeneratedImage,
  addRequirement,
  recordDecision,
  replaceDraftMilestones,
  replaceDraftTasks,
  resolveOpenQuestion,
  updateConversationStatus,
  updateProjectContext,
  updateRequirementStatus,
  type ProjectContext,
  type Requirement,
} from './project-db';
import { blueprintConfig } from './blueprint-config';
import { fetchPage, searchWeb } from './research';
import { generateImage } from './image-gen';
import { syncDiscoveryCompleteness } from './conversation-state';
import { isDiscoveryComplete } from './discovery';

const REQUIREMENT_CATEGORIES: Requirement['category'][] = [
  'feature',
  'constraint',
  'preference',
  'technical',
];
const REQUIREMENT_STATUSES: Requirement['status'][] = [
  'captured',
  'clarified',
  'accepted',
  'rejected',
];
const PRIORITIES: Requirement['priority'][] = ['low', 'medium', 'high', 'critical'];
const DECISION_CATEGORIES = ['design', 'scope', 'technical', 'timeline', 'budget'];
const MAX_MILESTONES = 10;

export function toolText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function stringList(value: unknown, maxItems: number, itemMaxLength: number): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const list = value
    .map((item) => toolText(item, itemMaxLength))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);

  return list.length > 0 ? list : null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export type ToolContext = { ownerId?: string; guest?: boolean };

// Free images are capped per chat so a free tool cannot be farmed; the cap is generous enough
// for real iteration (a logo, a few ad visuals, a variation or two).
const IMAGE_LIMIT_GUEST = 4;
const IMAGE_LIMIT_MEMBER = 12;

export async function executeTool(
  conversationId: string,
  toolCall: ToolCall,
  context: ToolContext = {},
): Promise<string> {
  const name = toolCall.function.name;
  let args: Record<string, unknown> = {};

  try {
    args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
  } catch {
    return JSON.stringify({ error: 'Tool arguments were not valid JSON' });
  }

  switch (name) {
    case 'update_project_context': {
      const updates: Partial<ProjectContext> = {};
      const projectName = toolText(args.project_name, 120);
      const problemStatement = toolText(args.problem_statement, 2000);
      const targetUsers = stringList(args.target_users, 12, 120);
      const platforms = stringList(args.platforms, 8, 60);

      if (projectName) updates.project_name = projectName;
      if (problemStatement) updates.problem_statement = problemStatement;
      if (targetUsers) updates.target_users = targetUsers;
      if (platforms) updates.platforms = platforms;

      if (Object.keys(updates).length === 0) {
        return JSON.stringify({ error: 'No recognised project context fields were provided' });
      }

      const context = await updateProjectContext(conversationId, updates);

      if (!context) {
        return JSON.stringify({ error: 'Project context could not be saved' });
      }

      return JSON.stringify({
        success: true,
        project_name: context.project_name,
        target_users: context.target_users,
        platforms: context.platforms,
      });
    }

    case 'add_requirement': {
      const title = toolText(args.title, 200);

      if (!title) {
        return JSON.stringify({ error: 'A requirement needs a title' });
      }

      const category = REQUIREMENT_CATEGORIES.includes(args.category as Requirement['category'])
        ? (args.category as Requirement['category'])
        : 'feature';
      const priority = PRIORITIES.includes(args.priority as Requirement['priority'])
        ? (args.priority as Requirement['priority'])
        : 'medium';

      const requirement = await addRequirement({
        conversation_id: conversationId,
        category,
        title,
        description: toolText(args.description, 1000) || null,
        priority,
        status: 'captured',
      });

      if (!requirement) {
        return JSON.stringify({ error: 'Requirement could not be saved' });
      }

      return JSON.stringify({
        success: true,
        requirement_id: requirement.id,
        category: requirement.category,
        title: requirement.title,
      });
    }

    case 'update_requirement': {
      const requirementId = toolText(args.requirement_id, 64);
      const status = args.status as Requirement['status'];

      if (!requirementId || !REQUIREMENT_STATUSES.includes(status)) {
        return JSON.stringify({
          error: 'requirement_id plus one of captured|clarified|accepted|rejected is required',
        });
      }

      const requirement = await updateRequirementStatus(requirementId, status);

      if (!requirement) {
        return JSON.stringify({ error: 'Requirement could not be updated (unknown id?)' });
      }

      return JSON.stringify({
        success: true,
        requirement_id: requirement.id,
        status: requirement.status,
      });
    }

    case 'add_open_question': {
      const title = toolText(args.title, 240);

      if (!title) {
        return JSON.stringify({ error: 'An open question needs a title' });
      }

      const question = await addOpenQuestion({
        conversation_id: conversationId,
        title,
        description: toolText(args.description, 800) || null,
        priority: PRIORITIES.includes(args.priority as Requirement['priority'])
          ? (args.priority as Requirement['priority'])
          : 'medium',
      });

      if (!question) {
        return JSON.stringify({ error: 'Open question could not be saved' });
      }

      return JSON.stringify({ success: true, requirement_id: question.id, title: question.title });
    }

    case 'resolve_open_question': {
      const requirementId = toolText(args.requirement_id, 64);

      if (!requirementId) {
        return JSON.stringify({ error: 'requirement_id is required' });
      }

      const question = await resolveOpenQuestion(requirementId, toolText(args.resolution, 800));

      if (!question) {
        return JSON.stringify({ error: 'Open question could not be resolved (unknown id?)' });
      }

      return JSON.stringify({ success: true, requirement_id: question.id, status: question.status });
    }

    case 'record_decision': {
      const title = toolText(args.title, 200);
      const decision = toolText(args.decision, 2000);
      const category = DECISION_CATEGORIES.includes(String(args.category))
        ? (String(args.category) as 'design' | 'scope' | 'technical' | 'timeline' | 'budget')
        : 'scope';

      if (!title || !decision) {
        return JSON.stringify({ error: 'A decision needs a title and the decision text' });
      }

      const saved = await recordDecision({
        conversation_id: conversationId,
        category,
        title,
        description: toolText(args.description, 2000) || null,
        decision,
        decided_by: 'ai',
      });

      if (!saved) {
        return JSON.stringify({ error: 'Decision could not be saved' });
      }

      return JSON.stringify({ success: true, decision_id: saved.id, title: saved.title });
    }

    case 'calculate_estimate': {
      const weeks = [positiveNumber(args.weeks_min), positiveNumber(args.weeks_max)];
      const cost = [positiveNumber(args.cost_min), positiveNumber(args.cost_max)];

      if (weeks.some((value) => value === null) || cost.some((value) => value === null)) {
        return JSON.stringify({
          error: 'weeks_min, weeks_max, cost_min and cost_max must all be positive numbers',
        });
      }

      const [weeksA, weeksB] = weeks as number[];
      const [costA, costB] = cost as number[];

      const context = await updateProjectContext(conversationId, {
        estimated_weeks_min: Math.min(weeksA, weeksB),
        estimated_weeks_max: Math.max(weeksA, weeksB),
        estimated_cost_min: Math.min(costA, costB),
        estimated_cost_max: Math.max(costA, costB),
        currency: 'EUR',
      });

      if (!context) {
        return JSON.stringify({ error: 'Estimate could not be saved' });
      }

      return JSON.stringify({
        success: true,
        estimate: {
          currency: context.currency ?? 'EUR',
          cost_min: context.estimated_cost_min,
          cost_max: context.estimated_cost_max,
          weeks_min: context.estimated_weeks_min,
          weeks_max: context.estimated_weeks_max,
        },
        note: 'AI-generated estimate stored. It is not a BrandForge proposal and is not binding.',
      });
    }

    case 'set_project_milestones': {
      const rawMilestones = Array.isArray(args.milestones)
        ? args.milestones.slice(0, MAX_MILESTONES)
        : [];

      const milestones = rawMilestones
        .map((milestone: unknown) => {
          const m = (milestone ?? {}) as Record<string, unknown>;
          return {
            title: toolText(m.title, 160),
            description: toolText(m.description, 600) || null,
            amount: positiveNumber(m.amount),
            estimated_weeks: positiveNumber(m.estimated_weeks),
          };
        })
        .filter((milestone: { title: string }) => milestone.title.length > 0);

      if (milestones.length === 0) {
        return JSON.stringify({ error: 'At least one milestone with a title is required' });
      }

      const saved = await replaceDraftMilestones(conversationId, milestones);

      if (saved.length === 0) {
        return JSON.stringify({ error: 'Milestones could not be saved' });
      }

      return JSON.stringify({
        success: true,
        milestones: saved.map((milestone) => ({
          sequence: milestone.sequence,
          title: milestone.title,
          amount: milestone.amount,
          estimated_weeks: milestone.estimated_weeks,
        })),
        note: 'AI-suggested milestones stored. A human BrandForge plan can replace them.',
      });
    }

    case 'set_project_tasks': {
      const rawTasks = Array.isArray(args.tasks) ? args.tasks.slice(0, 20) : [];

      const tasks = rawTasks
        .map((task: unknown) => {
          const t = (task ?? {}) as Record<string, unknown>;
          const sequence = Number(t.milestone_sequence);
          return {
            title: toolText(t.title, 200),
            description: toolText(t.description, 800) || null,
            assignee_name: toolText(t.assignee_name, 80) || null,
            milestone_sequence: Number.isFinite(sequence) && sequence > 0 ? Math.round(sequence) : null,
          };
        })
        .filter((task: { title: string }) => task.title.length > 0);

      if (tasks.length === 0) {
        return JSON.stringify({ error: 'At least one task with a title is required' });
      }

      const saved = await replaceDraftTasks(conversationId, tasks);

      if (saved.length === 0) {
        return JSON.stringify({ error: 'Tasks could not be saved' });
      }

      return JSON.stringify({
        success: true,
        tasks: saved.map((task) => ({
          title: task.title,
          assignee_name: task.assignee_name,
          status: task.status ?? 'TODO',
        })),
        note: 'AI-drafted tasks stored. Tasks already claimed by a human were left untouched.',
      });
    }

    case 'check_discovery_completeness': {
      const discovery = await syncDiscoveryCompleteness(conversationId);

      return JSON.stringify({
        success: true,
        completeness: discovery.completeness,
        percent: discovery.percent,
        missing: discovery.missing,
        checklist: discovery.checklist.map((step) => ({ label: step.label, met: step.met })),
        ready_for_human_review: isDiscoveryComplete(discovery.completeness),
      });
    }

    case 'research_web': {
      // Read-only: touches no project state. fetchPage is SSRF default-deny
      // (private/loopback/metadata hosts refused before any request).
      const url = toolText(args.url, 500);
      const query = toolText(args.query, 200);
      if (!url && !query) {
        return JSON.stringify({ error: 'Provide a url to read or a query to search' });
      }
      const config = blueprintConfig();
      const clip = (text: string) => text.slice(0, 3000);
      try {
        if (url) {
          const page = await fetchPage(url, { timeoutMs: 8000, maxChars: 6000 });
          return JSON.stringify({ pages: [{ url: page.url, title: page.title, text: clip(page.text) }] });
        }
        if (!config.searchApiKey || !config.researchEnabled) {
          return JSON.stringify({ error: 'Web search is not configured. Say so, and work from what the founder told you.' });
        }
        const found = await searchWeb({
          query,
          num: 5,
          provider: config.searchProvider,
          apiKey: config.searchApiKey,
          timeoutMs: 6000,
        });
        const top = found.results.slice(0, 2);
        const pages = await Promise.all(
          top.map((result) =>
            fetchPage(result.url, { timeoutMs: 6000, maxChars: 4000 })
              .then((page) => ({ url: page.url, title: page.title, text: clip(page.text) }))
              .catch(() => ({ url: result.url, title: result.title, text: result.snippet })),
          ),
        );
        return JSON.stringify({
          results: found.results.map((r) => ({ url: r.url, title: r.title, snippet: r.snippet })),
          pages,
        });
      } catch (error) {
        return JSON.stringify({ error: error instanceof Error ? error.message.slice(0, 200) : 'Research failed' });
      }
    }

    case 'generate_image': {
      const prompt = toolText(args.prompt, 600);
      const caption = toolText(args.caption, 90);
      const sceneNumber = Math.round(Number(args.scene));
      const scene = Number.isFinite(sceneNumber) && sceneNumber >= 1 && sceneNumber <= 6 ? sceneNumber : null;
      const aspect = ['square', 'portrait', 'landscape'].includes(String(args.aspect))
        ? (String(args.aspect) as 'square' | 'portrait' | 'landscape')
        : 'square';
      if (prompt.length < 8) {
        return JSON.stringify({ error: 'Describe the image in at least a short sentence.' });
      }
      if (!context.ownerId) {
        return JSON.stringify({ error: 'Image creation is not available in this chat.' });
      }
      const limit = context.guest ? IMAGE_LIMIT_GUEST : IMAGE_LIMIT_MEMBER;
      if ((await countGeneratedImages(conversationId)) >= limit) {
        return JSON.stringify({
          error: context.guest
            ? 'This chat has used its free images. Tell the person to save the chat (free) for more.'
            : 'This chat has reached its image limit. Say so and suggest starting a new chat.',
        });
      }
      // FLUX has no negative prompts and "no text" can attract lettering; positive phrasing steers away from invented labels.
      const result = await generateImage({
        prompt: `${prompt.replace(/[.\s]+$/, '')}. Unbranded, plain blank surfaces, clean minimal composition.`.slice(0, 600),
        aspect,
        // Captioned images are video scenes: three at once, so take the fast model.
        quality: caption || args.batch === true ? 'fast' : 'best',
      });
      if (!result.ok) {
        return JSON.stringify({
          error:
            result.reason === 'blocked'
              ? 'That image request is not allowed. Offer a different, safe direction.'
              : 'Image creation is busy right now. Say so plainly and offer to describe the visual in words instead.',
        });
      }
      const stored = await storeGeneratedImage(conversationId, context.ownerId, result.bytes, result.contentType);
      if (!stored) {
        return JSON.stringify({ error: 'The image could not be saved. Say so plainly.' });
      }
      const messageId = await addMessage({
        conversation_id: conversationId,
        sender_type: 'ai',
        sender_name: 'BrandForge',
        content: prompt.slice(0, 200),
        content_type: 'text',
        artifact_data: {
          ...stored,
          generated: true,
          provider: result.provider,
          source: 'ai',
          ...(caption ? { caption } : {}),
          ...(scene ? { scene } : {}),
          // Why earlier providers were skipped (status codes only, never keys): the first thing to
          // read when a configured provider seems to be ignored.
          ...(result.attempts.length > 0 ? { fallback: result.attempts.join(' | ').slice(0, 300) } : {}),
        },
      });
      if (!messageId) {
        return JSON.stringify({ error: 'The image could not be shown in the chat. Say so plainly.' });
      }
      return JSON.stringify({
        success: true,
        note: 'The image is now visible in the chat labelled AI-generated. You cannot see it: do not describe its details; refer to it as the image above and offer variations.',
      });
    }

    case 'request_human_review': {
      const reason = toolText(args.reason, 500);
      const updated = await updateConversationStatus(conversationId, 'READY_FOR_REVIEW');

      if (!updated) {
        return JSON.stringify({ error: 'Conversation status could not be updated' });
      }

      await addMessage({
        conversation_id: conversationId,
        sender_type: 'ai',
        sender_name: 'BrandForge',
        content: `Requirements sent to BrandForge for human review.${reason ? ` Reason: ${reason}` : ''}`,
        content_type: 'system',
      });

      return JSON.stringify({ success: true, status: 'READY_FOR_REVIEW' });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

