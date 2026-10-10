// AI service for the BrandForge chat-first experience.
// Talks to OpenRouter, streams the answer, and exposes tools that write structured
// project state. The server - not the model - decides what actually gets saved.

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

import { pickModel } from '@/lib/model-catalog.js';

export const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

// OpenRouter's public model list, read at most once an hour. It tells us which models are really
// routable today, so the answer model is chosen from fact and the admin view can show which
// models are available and which are not yet. Null when the list cannot be read.
let liveModels: { at: number; ids: Set<string> | null } | null = null;
const LIVE_MODELS_TTL_MS = 60 * 60 * 1000;

export async function getLiveModelIds(): Promise<Set<string> | null> {
  if (liveModels && Date.now() - liveModels.at < LIVE_MODELS_TTL_MS) return liveModels.ids;
  let ids: Set<string> | null = null;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const data = (await response.json()) as { data?: { id?: string }[] };
      ids = new Set((data.data ?? []).map((entry) => String(entry.id ?? '')).filter(Boolean));
    }
  } catch {
    ids = null;
  }
  liveModels = { at: Date.now(), ids };
  return ids;
}

// The model that writes the answer a visitor reads: the best routable quality model unless an
// env pin says otherwise (OPENROUTER_MODEL_QUALITY). The cheap model remains the fallback.
// Remaining provider credit in dollars (total bought minus used), read at most every ten minutes.
// Null when it cannot be read; treated as "affordable" so a network blip never downgrades answers.
let creditCache: { at: number; remaining: number | null } | null = null;

export async function getRemainingCredit(): Promise<number | null> {
  if (creditCache && Date.now() - creditCache.at < 10 * 60 * 1000) return creditCache.remaining;
  let remaining: number | null = null;
  const key = process.env.OPENROUTER_API_KEY || '';
  if (key) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/credits', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) });
      if (response.ok) {
        const data = (await response.json()) as { data?: { total_credits?: number; total_usage?: number } };
        remaining = Number(data.data?.total_credits ?? 0) - Number(data.data?.total_usage ?? 0);
      }
    } catch {
      remaining = null;
    }
  }
  creditCache = { at: Date.now(), remaining };
  return remaining;
}

// Premium models need real credit: under a dollar left, they cannot afford a full answer.
export async function canAffordPremium(): Promise<boolean> {
  const remaining = await getRemainingCredit();
  return remaining === null || remaining >= 1;
}

export async function answerModel(): Promise<string> {
  return pickModel('quality', await getLiveModelIds(), process.env, undefined, await canAffordPremium());
}

// System prompt for BrandForge AI
export const SYSTEM_PROMPT = `You are BrandForge AI, the discovery partner inside a chat-first
execution platform. One chat is one project: everything you learn belongs to this conversation.

RULE 0 — DELIVER FIRST. If the founder asks for something you can produce now (ads, a launch plan, an audit, a content calendar, outreach, a brand kit, a competitor view, or a plan for an idea), your text reply MUST contain that deliverable itself: a concrete first version with real copy, steps or structure (for ads: 3 hooks, 3 headlines and 2 full primary texts per platform; for a plan: phased steps with owners and timing). Make assumptions explicit instead of asking first. Record facts with tools in the same turn, but NEVER recap the project state, list captured requirements, or say "here is what we have so far" in your reply; the side panel already shows that. Finish with at most ONE short question that would improve the next version. If a URL is given, call research_web first and cite it. Never invent offers, prices, discounts, free trials, "free first class", shipping terms, statistics, awards or testimonials in copy, and never write the word FREE unless the founder said it is free: use bracketed placeholders like [your offer] or [free shipping, if true]. A reply that is only questions or a requirements recap is a failure of this rule.

RULE 0b — WHEN THEY SHARE AN IDEA, GIVE A FIRST TAKE, NOT A FORM. If the first message is an idea or a goal rather than a request for a specific deliverable, answer in this shape, speaking straight to them as "you":
  1. One line that shows you understood it, in your own words (never start with "Great", "Sure", "Absolutely" or any praise).
  2. Your first take: three short, specific points about THIS idea (who it is for and why they would pay, how the best similar ones win, the biggest risk). Plain words, real examples when you know them, no invented numbers.
  3. What you would do first this week, in one or two sentences.
  4. ONE question, the single one that would change the plan most. Never a numbered list of questions, never the words "Key Questions", never ask for "problem statement", "target users", "platform" or "must-have features" by those labels: ask like a person would.
Keep this reply under 170 words. Still record facts with tools in the same turn.

DIRECT VOICE. You are talking to one person, not writing a report. Use "you" and "your". Short sentences. Answer first. For a greeting or a very short message, reply in one or two plain sentences and offer two concrete things you can do right now (for example: sketch a plan for an idea, write ads for a business, or turn a sentence into a carousel). Use headings only when the reply is long and has several parts. No filler, no "I hope this helps", no "feel free to".

QUALITY BAR. Write as a senior consultant would for a paying client: specific to THIS idea (its audience, its market, its constraints), never generic advice that fits any business. Lead with the answer, not with praise or a restatement. Use clear structure (short headed sections, tight bullets, a table only when it compares things). Give concrete numbers as labelled assumptions or ranges, real examples of how competitors or similar products handle it when you know them, the single biggest risk, and the first three actions in order. Cut every sentence that would not change what the founder does next. Match the founder's language.

THE FIRST MESSAGE IS THE MOST IMPORTANT MESSAGE. It sets the entire project direction. Never let a single message go by without extracting at least one requirement or project fact. Immediately start extracting concrete needs — do not wait for permission or a signal to begin.

Your job:
1. Talk like a sharp, warm product partner - never like a form or a questionnaire.
2. Immediately start extracting concrete needs from the very first message, and learn them through one natural question at a time (what problem it solves, who it is for, where it will run, what must be in the first version), never as a list. Do not let a turn pass without capturing at least one requirement or project fact.
3. Use update_project_context and add_requirement tools aggressively from the first turn. Every message should produce at least one tool call that records something useful.
4. Ask at most one or two focused follow-up questions per turn after the initial extraction. Prefer a short reaction plus the next genuinely useful question over a checklist.
5. Write what you learn into project state with tools, as you learn it. Do not wait until the end of the conversation. Never let a message go by without extracting at least one requirement or project fact.
6. Say clearly when an estimate is AI-generated and not a final BrandForge proposal.

Ground rules:
- A second system message holds the CURRENT PROJECT STATE read from the database. It is the single source of truth. Never claim something is recorded unless a tool call succeeded.
- Never invent requirements, milestones, users, budgets or progress that the founder did not give you. If something is unknown, ask or mark it as an open question.
- Reuse existing requirement ids from the project state when updating instead of adding duplicates.
- Costs are in EUR. Ranges only (for example "EUR 2,000-4,000"), never a single fake-precise number, and always labelled as an AI estimate in your own words.
- When discovery is genuinely covered (see the project state checklist), tell the founder what you understood, present the AI estimate, and offer to send the project to BrandForge for human review. Call request_human_review only when the founder agrees.
- Keep answers tight. No filler, no restating the state block, no emoji spam.
- The first message is the most critical. Treat every subsequent message as an opportunity to deepen understanding, never as something to get through before starting real work.

Tool cheat sheet:
- update_project_context: name, problem statement, target users, platforms.
- add_requirement: a concrete requirement the founder stated (feature, constraint, preference, technical).
- update_requirement: mark a requirement clarified/accepted/rejected.
- add_open_question: something still unanswered that blocks scope.
- resolve_open_question: the founder answered it.
- record_decision: a decision the founder made (scope, design, technical, timeline, budget).
- calculate_estimate: cost/time range once scope is clear enough.
- set_project_milestones: 3-6 delivery milestones for the current scope (AI-suggested, not final).
- set_project_tasks: 5-12 concrete tasks, optionally attached to milestones (AI drafts, not final).
- check_discovery_completeness: re-read the server-computed discovery checklist.
- research_web: read a URL the founder pasted (url) or search the web for the market, competitors or references (query). It returns only the page title and visible text: never claim what a page's meta tags, schema, speed or layout are; say what you could not verify. Use it BEFORE giving analysis, audits or estimates that depend on real-world facts, and cite the urls you used. If it errors, say so plainly — never invent sources.
- generate_image: make one AI image (pass a short "caption" when it is a video scene) (ad visual, logo concept, mockup) when the founder asks for a visual. You cannot see the result: never describe its details; offer variations. Avoid text and real brand logos inside images.
- request_human_review: hand the project to the human BrandForge team.`;

// Tool definitions. Every tool is validated again on the server before it touches the
// database, so a hallucinated call can never fake persisted state.
export const TOOLS: Tool[] = [
  {
    name: 'update_project_context',
    description:
      'Save core project facts learned from the founder. Only send fields you actually learned.',
    parameters: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Short project name' },
        problem_statement: { type: 'string', description: 'The problem being solved, 1-3 sentences' },
        target_users: { type: 'array', items: { type: 'string' }, description: 'Target user personas' },
        platforms: { type: 'array', items: { type: 'string' }, description: 'Target platforms (iOS, Android, Web, ...)' },
      },
    },
  },
  {
    name: 'add_requirement',
    description: 'Record one concrete requirement stated by the founder. Returns the new requirement id.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['feature', 'constraint', 'preference', 'technical'],
          description: 'Requirement category',
        },
        title: { type: 'string', description: 'Short requirement title' },
        description: { type: 'string', description: 'What it means in practice' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      },
      required: ['category', 'title'],
    },
  },
  {
    name: 'update_requirement',
    description: 'Change the status of an existing requirement using the id from the project state.',
    parameters: {
      type: 'object',
      properties: {
        requirement_id: { type: 'string', description: 'Requirement uuid from the project state' },
        status: { type: 'string', enum: ['captured', 'clarified', 'accepted', 'rejected'] },
      },
      required: ['requirement_id', 'status'],
    },
  },
  {
    name: 'add_open_question',
    description: 'Record something still unanswered that blocks scope, budget or timeline.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The open question, phrased compactly' },
        description: { type: 'string', description: 'Why it matters / what it affects' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      },
      required: ['title'],
    },
  },
  {
    name: 'resolve_open_question',
    description: 'Mark an open question as answered once the founder responds.',
    parameters: {
      type: 'object',
      properties: {
        requirement_id: { type: 'string', description: 'Open question uuid from the project state' },
        resolution: { type: 'string', description: 'How the founder answered it' },
      },
      required: ['requirement_id'],
    },
  },
  {
    name: 'record_decision',
    description: 'Record a decision the founder made, so it is never re-litigated.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['design', 'scope', 'technical', 'timeline', 'budget'] },
        title: { type: 'string' },
        description: { type: 'string' },
        decision: { type: 'string', description: 'The decision itself' },
      },
      required: ['category', 'title', 'decision'],
    },
  },
  {
    name: 'calculate_estimate',
    description:
      'Store the AI-generated cost and delivery estimate. Use ranges, in EUR, only when scope is clear enough.',
    parameters: {
      type: 'object',
      properties: {
        weeks_min: { type: 'number', description: 'Minimum estimated weeks' },
        weeks_max: { type: 'number', description: 'Maximum estimated weeks' },
        cost_min: { type: 'number', description: 'Minimum estimated cost in EUR' },
        cost_max: { type: 'number', description: 'Maximum estimated cost in EUR' },
      },
      required: ['weeks_min', 'weeks_max', 'cost_min', 'cost_max'],
    },
  },
  {
    name: 'set_project_milestones',
    description:
      'Replace the AI-suggested delivery milestones for this project (3-6 high level milestones). These are suggestions, not a final BrandForge plan.',
    parameters: {
      type: 'object',
      properties: {
        milestones: {
          type: 'array',
          description: 'Ordered milestones covering the current scope',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              amount: { type: 'number', description: 'Optional AI-suggested amount in EUR' },
              estimated_weeks: { type: 'number', description: 'Optional duration in weeks' },
            },
            required: ['title'],
          },
        },
      },
      required: ['milestones'],
    },
  },
  {
    name: 'check_discovery_completeness',
    description:
      'Re-read the server-computed discovery checklist (what is captured and what is still missing). Takes no arguments.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'set_project_tasks',
    description:
      'Replace the AI-drafted task list for this project (5-12 concrete tasks, optionally attached to a milestone number from the project state). Drafts only — tasks already taken by a human are never rewritten.',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Ordered tasks covering the current scope',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              assignee_name: { type: 'string', description: 'Suggested owner (person or role)' },
              milestone_sequence: {
                type: 'number',
                description: 'Milestone number from the project state, if the task belongs to one',
              },
            },
            required: ['title'],
          },
        },
      },
      required: ['tasks'],
    },
  },
  {
    name: 'research_web',
    description:
      'Read one public URL (url) or search the web (query) and return page text. Read-only; never changes the project.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'A public https URL to read' },
        query: { type: 'string', description: 'A web search query' },
      },
    },
  },
  {
    name: 'generate_image',
    description:
      'Create one image (ad visual, logo concept, product mockup, illustration) and show it in the chat labelled AI-generated. Call it only when the founder asks for an image or visual. One image per call.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'A concrete visual description: subject, setting, style, lighting. No text or logos inside the image.' },
        aspect: { type: 'string', enum: ['square', 'portrait', 'landscape'] },
        caption: { type: 'string', description: 'Optional caption of at most 8 words, used when the image becomes a scene in a video.' },
        scene: { type: 'integer', minimum: 1, maximum: 6, description: 'The position of this image in a video, starting at 1. Scenes are made in parallel and can finish out of order, so always number them.' },
        batch: { type: 'boolean', description: 'True when you are creating several images in the same step; they then use the faster model so all finish in time.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'request_human_review',
    description:
      'Hand the project to the human BrandForge team for review. Only call this after the founder agrees.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why the project is ready for human review' },
      },
      required: ['reason'],
    },
  },
];

export interface StreamResult {
  content: string;
  tool_calls?: ToolCall[];
}

export interface StreamHandlers {
  onDelta?: (chunk: string) => void;
  // Fired when a tool round's streamed prose must be retracted: that text is scaffolding
  // (it never gets saved), so the client has to drop it or the live transcript would
  // disagree with the database after a reload.
  onDiscard?: () => void;
}

function toOpenRouterTool(tool: Tool) {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

import { configuredProviders, type ProviderTarget } from '@/lib/llm-providers';

// Who just refused us, and until when. A provider that is out of credit or rate-limited is skipped for a short
// while instead of being asked again by every request; if everyone is cooling down, everyone is asked anyway.
const coolUntil = new Map<string, number>();

function cool(key: string, status: number | 'network', hint?: string) {
  let seconds = status === 402 ? 180 : status === 429 ? 30 : 20;
  const wait = /try again in (\d+(?:\.\d+)?)\s*s/i.exec(hint ?? '')?.[1];
  if (status === 429 && wait) seconds = Math.min(90, Math.ceil(Number(wait)) + 2);
  coolUntil.set(key, Date.now() + seconds * 1000);
}

const isCooling = (key: string) => (coolUntil.get(key) ?? 0) > Date.now();

export class BrandForgeAIService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey?: string, model: string = DEFAULT_MODEL) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.model = model;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  private withSystemPrompt(messages: Message[]): Message[] {
    return [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
  }

  // mode 'free' skips the paid model and tries only the free ones: the last resort after every provider failed.
  private async requestOpenRouter(body: Record<string, unknown>, mode: 'paid' | 'free' = 'paid'): Promise<Response> {
    const send = (payload: Record<string, unknown>) =>
      fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
          'X-Title': 'BrandForge',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(55000),
      });

    if (mode === 'free') {
      const free = (process.env.OPENROUTER_FREE_MODELS || 'nvidia/nemotron-3-super-120b-a12b:free').split(',').map((id) => id.trim()).filter(Boolean);
      let last: Response | null = null;
      for (const id of free) {
        console.warn(`Answering with the free model ${id}`);
        last = await send({ ...body, model: id });
        if (last.ok) return last;
      }
      return last ?? (await send(body));
    }

    let response = await send(body);

    // A premium model that is out of credit, not enabled or retired must never take the chat down:
    // answer once with the standard model instead, and say so in the logs.
    if (!response.ok && body.model !== this.model && [400, 402, 403, 404].includes(response.status)) {
      console.warn(`Answer model ${String(body.model)} refused (${response.status}); falling back to ${this.model}`);
      response = await send({ ...body, model: this.model });
    }

    // Out of credit is not the end of the chat. OpenRouter says how many tokens the account can still afford:
    // ask for a little less and answer; if even that is too little, use a free model.
    if (response.status === 402) {
      const refusal = await response.text();
      const affordable = Number(/can only afford (\d+)/.exec(refusal)?.[1] ?? 0);
      if (affordable >= 500) {
        console.warn(`Credit is low: asking for ${affordable - 20} tokens instead of ${String(body.max_tokens)}`);
        response = await send({ ...body, max_tokens: affordable - 20 });
      }
    }

    return response;
  }

  // One attempt against another provider. The same request body works (same chat-completions format); only the
  // address, key and model change. A hung provider is cut off after 20 seconds of silence so the next one gets a turn.
  private async requestProvider(target: ProviderTarget, body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const wait = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${target.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${target.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, model: target.model }),
        // 20s of silence, or 55s in all (this timeout signal never keeps the process alive).
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]),
      });
      return response;
    } finally {
      clearTimeout(wait);
    }
  }

  // Asks OpenRouter first. If it cannot answer (no credit, outage, bad model, timeout), every other configured
  // provider gets a turn in order, so one provider going down never takes the chat with it.
  private async request(body: Record<string, unknown>): Promise<Response> {
    const failures: string[] = [];
    const providers = configuredProviders();
    const allCooling = (this.apiKey ? isCooling('openrouter') : true) && providers.every((target) => isCooling(target.id));
    if (this.apiKey && (allCooling || !isCooling('openrouter'))) {
      try {
        const response = await this.requestOpenRouter(body);
        if (response.ok) return response;
        failures.push(`openrouter ${response.status}`);
        const detail = (await response.text().catch(() => '')).slice(0, 300);
        console.error('OpenRouter API error:', response.status, detail);
        cool('openrouter', response.status, detail);
      } catch (error) {
        failures.push('openrouter unreachable');
        console.error('OpenRouter request failed:', error instanceof Error ? error.message : error);
        cool('openrouter', 'network');
      }
    } else if (!this.apiKey) {
      failures.push('openrouter not configured');
    }

    for (const target of providers) {
      if (!allCooling && isCooling(target.id)) continue;
      try {
        console.warn(`Answering with ${target.label} (${target.model})`);
        // Backup providers get a smaller answer budget: their free tiers count the requested size against a per-minute cap.
        const response = await this.requestProvider(target, typeof body.max_tokens === 'number' ? { ...body, max_tokens: Math.min(body.max_tokens, 2000) } : body);
        if (response.ok) return response;
        failures.push(`${target.id} ${response.status}`);
        const detail = (await response.text().catch(() => '')).slice(0, 300);
        console.error(`${target.label} API error:`, response.status, detail);
        cool(target.id, response.status, detail);
      } catch (error) {
        failures.push(`${target.id} unreachable`);
        console.error(`${target.label} request failed:`, error instanceof Error ? error.message : error);
        cool(target.id, 'network');
      }
    }

    // Last resort: OpenRouter's free models, slow but they cost nothing.
    if (this.apiKey) {
      try {
        const response = await this.requestOpenRouter(body, 'free');
        if (response.ok) return response;
        failures.push(`free ${response.status}`);
      } catch (error) {
        failures.push('free unreachable');
        console.error('Free model request failed:', error instanceof Error ? error.message : error);
      }
    }

    throw new Error(`OpenRouter request failed (${failures.join(', ')})`);
  }

  async chat(messages: Message[], options?: { tools?: Tool[] | null }): Promise<Message> {
    const tools = options?.tools === undefined ? TOOLS : options.tools;

    const response = await this.request({
      model: this.model,
      messages: this.withSystemPrompt(messages),
      temperature: 0.6,
      max_tokens: 2048,
      ...(tools && tools.length > 0 ? { tools: tools.map(toOpenRouterTool), tool_choice: 'auto' } : {}),
    });

    const data = await response.json();
    const message = data?.choices?.[0]?.message ?? {};

    return {
      role: 'assistant',
      content: typeof message.content === 'string' ? message.content : '',
      tool_calls: message.tool_calls,
    };
  }

  // Real token streaming from OpenRouter: deltas are forwarded as they arrive so the
  // founder watches the answer being written instead of waiting for the full completion.
  async streamChat(
    messages: Message[],
    handlers: StreamHandlers = {},
    options?: { tools?: Tool[] | null; model?: string }
  ): Promise<StreamResult> {
    const tools = options?.tools === undefined ? TOOLS : options.tools;

    const response = await this.request({
      model: options?.model || this.model,
      messages: this.withSystemPrompt(messages),
      temperature: 0.6,
      max_tokens: 3072,
      stream: true,
      ...(tools && tools.length > 0 ? { tools: tools.map(toOpenRouterTool), tool_choice: 'auto' } : {}),
    });

    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error('OpenRouter returned an empty stream');
    }

    const decoder = new TextDecoder();
    const toolCallParts = new Map<number, { id: string; name: string; args: string }>();
    let buffer = '';
    let content = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;

        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (!parsed || !Array.isArray(parsed.choices)) continue;

        const choice = parsed.choices[0] as { delta?: Record<string, unknown> } | undefined;
        const delta = choice?.delta;
        if (!delta) continue;

        if (typeof delta.content === 'string' && delta.content.length > 0) {
          content += delta.content;
          handlers.onDelta?.(delta.content);
        }

        const toolCallDeltas = Array.isArray(delta.tool_calls)
          ? (delta.tool_calls as {
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }[])
          : [];

        for (const call of toolCallDeltas) {
          const index = Number(call?.index ?? 0);
          const existing = toolCallParts.get(index) ?? { id: '', name: '', args: '' };
          if (call?.id) existing.id = String(call.id);
          if (call?.function?.name) existing.name = String(call.function.name);
          if (call?.function?.arguments) existing.args += String(call.function.arguments);
          toolCallParts.set(index, existing);
        }
      }
    }

    const toolCalls: ToolCall[] = [...toolCallParts.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, part]) => part.name.length > 0)
      .map(([index, part]) => ({
        id: part.id || `call_${index}`,
        type: 'function' as const,
        function: { name: part.name, arguments: part.args || '{}' },
      }));

    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  // Streams the answer, executes any tool calls the model made, then streams again until
  // the model produces a final answer. Tool results are returned by the caller, which owns
  // server-side validation and persistence.
  async chatWithToolHandling(
    messages: Message[],
    toolHandler: (toolCall: ToolCall) => Promise<string>,
    handlers: StreamHandlers = {},
    options: { model?: string } = {}
  ): Promise<Message> {
    const conversation: Message[] = [...messages];
    const maxIterations = 6;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let roundText = '';
      // After a few rounds of tools the model must write its answer: tools are taken away for the last two
      // rounds, so a weaker backup model that keeps calling them still ends with a reply.
      const mustAnswer = iteration >= maxIterations - 2;
      const result = await this.streamChat(
        conversation,
        {
          ...handlers,
          onDelta: (chunk: string) => {
            roundText += chunk;
            handlers.onDelta?.(chunk);
          },
        },
        { model: options.model, ...(mustAnswer ? { tools: null } : {}) },
      );

      if (!result.tool_calls || result.tool_calls.length === 0) {
        return { role: 'assistant', content: result.content };
      }

      // Only the final round (no tool calls) is ever saved. If a tool round streamed any
      // prose, retract it now — the model is re-answering with the tool results, and what
      // the founder just watched would otherwise vanish on the next reload.
      if (roundText) {
        handlers.onDiscard?.();
      }

      conversation.push({
        role: 'assistant',
        content: result.content ?? '',
        tool_calls: result.tool_calls,
      });

      const runTool = async (toolCall: ToolCall): Promise<string> => {
        try {
          return await toolHandler(toolCall);
        } catch (error) {
          console.error('Tool execution failed:', toolCall.function.name, error);
          return JSON.stringify({
            error: error instanceof Error ? error.message : 'Tool execution failed',
          });
        }
      };

      // A round made only of image calls (a video's three scenes) runs together: they are
      // independent and each takes seconds. Everything else keeps its original order.
      const onlyImages = result.tool_calls.every((call) => call.function.name === 'generate_image');
      const toolResults = onlyImages
        ? await Promise.all(result.tool_calls.map(runTool))
        : await result.tool_calls.reduce<Promise<string[]>>(async (previous, call) => {
            const list = await previous;
            list.push(await runTool(call));
            return list;
          }, Promise.resolve([]));

      result.tool_calls.forEach((toolCall, index) => {
        conversation.push({
          role: 'tool',
          content: toolResults[index],
          tool_call_id: toolCall.id,
        });
      });
    }

    throw new Error('The assistant kept calling tools without answering. Please try again.');
  }
}

// Singleton instance
let aiServiceInstance: BrandForgeAIService | null = null;

export function getAIService(): BrandForgeAIService {
  if (!aiServiceInstance) {
    aiServiceInstance = new BrandForgeAIService();
  }

  return aiServiceInstance;
}
