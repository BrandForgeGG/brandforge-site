import { NextRequest, NextResponse } from "next/server";
import { answerModel, getAIService, type Message as AIMessage } from "@/lib/ai-service";
import { budgetLimits, decideBudget } from "@/lib/ai-budget.js";
import { getActorName, getAuthenticatedUser } from "@/lib/supabase-server";
import {
  addMessage,
  canAccessConversation,
  db,
  downloadConversationAttachment,
  getConversationOwnerSession,
  getAiUsageToday,
  getGuestChatQuota,
  getMessages,
  isAdminAccount,
  raiseAiBudgetAlert,
  persistGuestChatQuota,
  runAsGuestSession,
  updateConversationTitle,
  updateProjectContext,
} from "@/lib/project-db";
import { consumeChatQuota } from "@/lib/blueprint-session";
import { deliverableDirective, tidySourcing } from "@/lib/deliverable-intent";
import { extractOutline } from "@/lib/deliverable-outline";
import { resolveGuestSession } from "@/lib/guest-session";
import { buildFileContextBlock, isDirectlyReadable } from "@/lib/file-context";
import {
  buildClientState,
  buildStateBlock,
  getConversationSnapshot,
  syncDiscoveryCompleteness,
} from "@/lib/conversation-state";
import { executeTool } from "@/lib/ai-tools";
import { checkRateLimit } from "@/lib/rate-limit";
import { screenText } from "@/lib/content-policy.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_HISTORY = 40;

// H8: each turn burns paid LLM tokens. Cap per signed-in user (per instance —
// see lib/rate-limit.js for the serverless caveat).
const CHAT_RATE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };

// Guest turns are capped per session per UTC day in the database (durable
// across instances, unlike the in-memory limiter above). Override for tests.
const GUEST_CHAT_MESSAGE_LIMIT = Math.max(
  1,
  Number(process.env.GUEST_CHAT_MESSAGE_LIMIT) || 15
);

// User-safe activity labels for tool calls that genuinely ran this turn. These are
// progress/status summaries for the "Thoughts" strip — never hidden reasoning, and
// never emitted for a tool that did not execute. Unknown tools get no label.
const TOOL_ACTIVITY: Record<string, string> = {
  update_project_context: "Updated project context",
  add_requirement: "Added a requirement",
  update_requirement: "Updated a requirement",
  add_open_question: "Added a question",
  resolve_open_question: "Answered a question",
  record_decision: "Recorded a decision",
  calculate_estimate: "Recalculated the estimate",
  set_project_milestones: "Updated milestones",
  set_project_tasks: "Updated the delivery plan",
  check_discovery_completeness: "Checked discovery completeness",
  request_human_review: "Requested human review",
  generate_image: "Creating an image",
};

// research_web labels carry the page host or the search the model asked for, read from the
// call's own arguments (never a guess).
function researchLabel(rawArguments: string | undefined): string {
  try {
    const args = JSON.parse(rawArguments || "{}") as { url?: unknown; query?: unknown };
    if (typeof args.url === "string" && args.url) {
      return `Read ${new URL(args.url).hostname.replace(/^www\./, "")}`;
    }
    if (typeof args.query === "string" && args.query) {
      return `Searched the web: ${args.query.slice(0, 48)}`;
    }
  } catch {
    // Fall through to the generic label.
  }
  return "Researched the web";
}

type ArtifactRef = {
  name: string;
  contentType: string;
  size: number;
  path: string;
};

// Collects the conversation's attachments for this turn. Text-like files are actually
// downloaded and decoded so the model can read them; binaries are only listed. Returns
// the items for lib/file-context plus the human-readable labels of real reads performed.
async function collectFileContext(
  conversationId: string,
): Promise<{
  items: Array<{
    name: string;
    contentType: string;
    size: number;
    text?: string | null;
  }>;
  labels: string[];
}> {
  const rows = await getMessages(conversationId, { limit: 100, includeDeleted: false });
  const seen = new Set<string>();
  const artifacts: ArtifactRef[] = [];

  for (const row of rows) {
    if (row.deleted_at) continue;
    const data = row.artifact_data as {
      path?: unknown;
      name?: unknown;
      contentType?: unknown;
      size?: unknown;
    } | null;
    if (
      row.content_type !== "attachment" ||
      !data ||
      typeof data.path !== "string" ||
      !data.path
    )
      continue;
    if (seen.has(data.path)) continue;
    seen.add(data.path);
    artifacts.push({
      name:
        typeof data.name === "string" && data.name ? data.name : "attachment",
      contentType: typeof data.contentType === "string" ? data.contentType : "",
      size: Number(data.size ?? 0),
      path: data.path,
    });
  }

  const recent = artifacts.slice(-8);
  const items: Array<{
    name: string;
    contentType: string;
    size: number;
    text?: string | null;
  }> = [];
  const labels: string[] = [];

  for (const artifact of recent) {
    if (!isDirectlyReadable(artifact.contentType)) {
      items.push(artifact);
      continue;
    }

    let text: string | null = null;
    try {
      const bytes = await downloadConversationAttachment(artifact.path);
      if (bytes) {
        // Supabase hands back a Blob; decode it properly rather than casting.
        text = Buffer.from(await bytes.arrayBuffer()).toString("utf8");
      }
    } catch {
      text = null;
    }

    items.push({ ...artifact, text });
    if (text !== null) {
      labels.push(`Read ${artifact.name}`);
    }
  }

  if (items.length > 0) {
    labels.push(
      `Listed ${items.length} project file${items.length === 1 ? "" : "s"}`,
    );
  }

  return { items, labels };
}

// POST /api/chat - run one BrandForge turn.
//
// Request: { conversationId, message? }
// The database owns the transcript: the client only ever sends the newest message, and a
// turn without a message answers the last founder message (that is how the landing page
// turns into a conversation).
//
// Response: server-sent events with { type: 'start' | 'delta' | 'message' | 'state' | 'done' | 'error' }.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  // Guest identity only when there is no signed-in user: the bf_bp HMAC
  // cookie plus its live blueprint_sessions row (resolveGuestSession).
  const guest = user ? null : await resolveGuestSession(request);

  if (!user && !guest) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  if (user) {
    const rate = checkRateLimit(`chat:${user.id}`, CHAT_RATE_LIMIT);

    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many messages — give BrandForge a moment and try again." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        },
      );
    }
  }

  let body: { conversationId?: string; message?: string } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const conversationId = String(body.conversationId ?? "").trim();
  const message = String(body.message ?? "")
    .trim()
    .slice(0, 8000);

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  // Sector guardrail: declined before any quota or model call is spent.
  const screened = screenText(message);
  if (!screened.ok) {
    return NextResponse.json({ error: screened.message, policy: screened.category }, { status: 422 });
  }

  if (user) {
    const hasAccess = await canAccessConversation(user.id, conversationId);

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  if (guest) {
    // The session must own the conversation (0023) before anything else, so a
    // guessed id can neither read nor burn quota.
    const owner = await getConversationOwnerSession(conversationId);
    if (owner !== guest.sessionId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Durable daily guest quota (separate counters from blueprint runs).
    const quotaState = await getGuestChatQuota(guest.sessionId);
    if (!quotaState.ok) {
      if (quotaState.error === "pending_migration") {
        return NextResponse.json(
          { error: "Guest chat storage is not set up yet. Has migration 0023 been applied?" },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: "Guest chat storage is not configured." },
        { status: 503 },
      );
    }

    const decision = consumeChatQuota(quotaState.quota, {
      limit: GUEST_CHAT_MESSAGE_LIMIT,
    });
    if (!decision.allowed) {
      return NextResponse.json(
        { error: "Daily guest message limit reached. Sign in to keep chatting.", retryAfterSeconds: 3600 },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    }

    const persisted = await persistGuestChatQuota(guest.sessionId, decision);
    if (!persisted.ok) {
      console.warn(`Guest chat quota write failed for session ${guest.sessionId}: ${persisted.error}`);
    }
  }

  // Daily spend guard: a per-account cap, a once-a-day staff warning and a global ceiling.
  // Guests are already capped per session above; the global ceiling covers them too.
  {
    const limits = budgetLimits(process.env);
    const usage = await getAiUsageToday(user?.id ?? null).catch(() => ({ userToday: 0, aiToday: 0 }));
    const isStaff = user ? await isAdminAccount(user.id).catch(() => false) : false;
    const budget = decideBudget({ ...usage, isStaff }, limits);
    if (budget.alert) {
      void raiseAiBudgetAlert(budget.alert, usage.aiToday).catch(() => undefined);
    }
    if (!budget.allowed) {
      return NextResponse.json(
        { error: budget.message, retryAfterSeconds: 3600 },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    }
  }

  const aiService = getAIService();

  if (!aiService.isConfigured()) {
    return NextResponse.json(
      {
        error:
          "BrandForge AI is unavailable: OPENROUTER_API_KEY is not configured",
      },
      { status: 503 },
    );
  }

  // Every database call below runs either as the signed-in caller (RLS) or,
  // for a guest, inside the verified session's service-role scope. The scope
  // is per-call so a guest turn touches nothing outside its own conversation.
  const scope = <T,>(fn: () => Promise<T>): Promise<T> =>
    guest ? runAsGuestSession(guest.sessionId, fn) : fn();

  if (message) {
    const storedMessageId = await scope(() =>
      addMessage({
        conversation_id: conversationId,
        sender_type: "user",
        sender_id: user?.id ?? null,
        sender_name: user ? getActorName(user) : "Guest",
        content: message,
        content_type: "text",
      }),
    );

    if (!storedMessageId) {
      return NextResponse.json(
        { error: "Your message could not be stored" },
        { status: 500 },
      );
    }
  }

  const snapshot = await scope(() => getConversationSnapshot(conversationId));

  if (!snapshot) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  // AI participation can be disabled per conversation (migration 0024).
  // When disabled, the AI does not automatically reply or update project context.
  const convData = await scope(async () => {
    const { data } = await (await db()).from('conversations').select('ai_enabled').eq('id', conversationId).single();
    return data;
  });
  const aiEnabled = convData?.ai_enabled !== false;
  if (!aiEnabled) {
    return NextResponse.json(
      { error: "AI participation is disabled for this conversation" },
      { status: 403 },
    );
  }

  const history = await scope(() =>
    getMessages(conversationId, { limit: MAX_HISTORY, includeDeleted: false }),
  );
  const conversational = history.filter(
    (entry) =>
      !entry.deleted_at &&
      entry.content_type !== "system" &&
      entry.content_type !== "ai_draft",
  );
  const lastMessage = conversational[conversational.length - 1];

  if (!lastMessage || lastMessage.sender_type !== "user") {
    return NextResponse.json(
      { error: "There is no founder message waiting for an answer" },
      { status: 400 },
    );
  }

  // Real file intelligence: text-like attachments are read now (so the reads genuinely
  // happened before we announce them); binaries are listed. See lib/file-context.js.
  let fileBlock = "";
  let fileLabels: string[] = [];
  try {
    const fileContext = await scope(() => collectFileContext(conversationId));
    fileBlock = buildFileContextBlock(fileContext.items);
    fileLabels = fileContext.labels;
  } catch {
    fileBlock = "";
    fileLabels = [];
  }

  const systemContent =
    buildStateBlock(snapshot) + (fileBlock ? `\n\n${fileBlock}` : "");

  const modelMessages: AIMessage[] = [
    { role: "system", content: systemContent },
    ...conversational.map((entry) => ({
      role:
        entry.sender_type === "user"
          ? ("user" as const)
          : ("assistant" as const),
      content: entry.content,
    })),
  ];

  // A request for concrete work (launch plan, ads, audit...) gets its directive as the LAST
  // system message, next to the request, so a thin one-line ask still returns the work.
  const directive = deliverableDirective(lastMessage.content);
  if (directive) {
    modelMessages.push({ role: "system", content: directive });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );

      send({ type: "start" });

      // Activity labels for steps that actually ran: the project snapshot was read to
      // build the system block, and the file reads above completed before the stream.
      send({ type: "activity", label: "Read project context" });
      for (const label of fileLabels) {
        send({ type: "activity", label });
      }

      try {
        const answer = await aiService.chatWithToolHandling(
          modelMessages,
          (toolCall) => {
            // Announce the tool only when it is actually about to execute.
            const label =
              toolCall.function?.name === "research_web"
                ? researchLabel(toolCall.function?.arguments)
                : TOOL_ACTIVITY[toolCall.function?.name];
            if (label) {
              send({ type: "activity", label });
            }
            return scope(() =>
              executeTool(conversationId, toolCall, {
                ownerId: user?.id ?? guest?.sessionId,
                guest: !user,
              }),
            );
          },
          {
            onDelta: (chunk) => send({ type: "delta", chunk }),
            // A tool round's prose is scaffolding — retract it instead of letting the
            // founder watch text that a reload would erase (stream ≠ saved).
            onDiscard: () => send({ type: "discard" }),
          },
          { model: await answerModel() },
        );

        const content = tidySourcing(answer.content.trim()).trim();

        if (content) {
          const assistantMessageId = await scope(() =>
            addMessage({
              conversation_id: conversationId,
              sender_type: "ai",
              sender_name: "BrandForge AI",
              content,
              content_type: "text",
              artifact_data: { source: "ai", status: "pending" },
            }),
          );

          if (assistantMessageId) {
            send({ type: "message", id: assistantMessageId });

            // A deliverable answer states its goal in the text. If the model recorded nothing
            // itself, persist the goal and a name so the saved project (and the panel after a
            // reload or sign-in) is not empty next to a finished plan.
            if (directive) {
              const outline = extractOutline(content);
              if (outline?.goal && !snapshot.context?.problem_statement) {
                await scope(() =>
                  updateProjectContext(conversationId, {
                    problem_statement: outline.goal!.slice(0, 2000),
                    ...(snapshot.context?.project_name
                      ? {}
                      : { project_name: String(snapshot.title ?? "").slice(0, 120) || undefined }),
                  }),
                ).catch(() => undefined);
              }
            }
          } else {
            // Field name matters: the client reads `error`.
            send({ type: "error", error: "The answer could not be saved. Please try again." });
          }
        } else {
          // The model finished without an answer (empty final round). Fail loudly rather
          // than leaving a blank assistant row that the refresh would silently drop.
          send({ type: "error", error: "BrandForge AI returned an empty answer. Please try again." });
        }

        const discovery = await scope(() =>
          syncDiscoveryCompleteness(conversationId),
        );
        let refreshed = await scope(() => getConversationSnapshot(conversationId));

        // A project gets its name from the conversation itself, never from a placeholder.
        if (
          refreshed &&
          (refreshed.title.trim().length === 0 ||
            refreshed.title === "New Project")
        ) {
          const firstFounderMessage = conversational.find(
            (entry) => entry.sender_type === "user",
          );
          const fallbackTitle =
            refreshed.context?.project_name ||
            firstFounderMessage?.content ||
            "";

          if (fallbackTitle.trim()) {
            await scope(() =>
              updateConversationTitle(
                conversationId,
                fallbackTitle.trim().slice(0, 60),
              ),
            );
            refreshed = await scope(() => getConversationSnapshot(conversationId));
          }
        }

        send({ type: "state", state: buildClientState(refreshed, discovery) });
        send({ type: "done" });
      } catch (error) {
        console.error("Chat turn failed:", error);
        send({
          type: "error",
          error: "BrandForge AI could not answer. Please try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
