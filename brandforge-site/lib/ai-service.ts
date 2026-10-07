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

export const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

// System prompt for BrandForge AI
export const SYSTEM_PROMPT = `You are BrandForge AI, the discovery partner inside a chat-first
execution platform. One chat is one project: everything you learn belongs to this conversation.

RULE 0 — DELIVER FIRST. If the founder asks for something you can produce now (ads, a launch plan, an audit, a content calendar, outreach, a brand kit, a competitor view, or a plan for an idea), your text reply MUST contain that deliverable itself: a concrete first version with real copy, steps or structure (for ads: 3 hooks, 3 headlines and 2 full primary texts per platform; for a plan: phased steps with owners and timing). Make assumptions explicit instead of asking first. Record facts with tools in the same turn, but NEVER recap the project state, list captured requirements, or say "here is what we have so far" in your reply; the side panel already shows that. Finish with at most ONE short question that would improve the next version. If a URL is given, call research_web first and cite it. Never invent offers, prices, discounts, shipping terms, statistics, awards or testimonials in copy: use bracketed placeholders like [your offer] or [free shipping, if true]. A reply that is only questions or a requirements recap is a failure of this rule.

THE FIRST MESSAGE IS THE MOST IMPORTANT MESSAGE. It sets the entire project direction. Never let a single message go by without extracting at least one requirement or project fact. Immediately start extracting concrete needs — do not wait for permission or a signal to begin.

Your job:
1. Talk like a sharp, warm product partner - never like a form or a questionnaire.
2. Immediately start extracting concrete needs from the very first message. Ask focused follow-up questions about: what problem it solves, target users, platform, must-have features. Do not let a turn pass without capturing at least one requirement or project fact.
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

  private async request(body: Record<string, unknown>): Promise<Response> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured for this deployment');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'BrandForge',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText.slice(0, 400));
      throw new Error(`OpenRouter request failed (${response.status})`);
    }

    return response;
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
    options?: { tools?: Tool[] | null }
  ): Promise<StreamResult> {
    const tools = options?.tools === undefined ? TOOLS : options.tools;

    const response = await this.request({
      model: this.model,
      messages: this.withSystemPrompt(messages),
      temperature: 0.6,
      max_tokens: 2048,
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
    handlers: StreamHandlers = {}
  ): Promise<Message> {
    const conversation: Message[] = [...messages];
    const maxIterations = 6;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let roundText = '';
      const result = await this.streamChat(conversation, {
        ...handlers,
        onDelta: (chunk: string) => {
          roundText += chunk;
          handlers.onDelta?.(chunk);
        },
      });

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
