import { NextRequest, NextResponse } from 'next/server';
import { getAIService, type Message as AIMessage } from '@/lib/ai-service';
import { getActorName, getAuthenticatedUser } from '@/lib/supabase-server';
import {
  addMessage,
  canAccessConversation,
  getMessages,
  updateConversationTitle,
} from '@/lib/project-db';
import {
  buildClientState,
  buildStateBlock,
  getConversationSnapshot,
  syncDiscoveryCompleteness,
} from '@/lib/conversation-state';
import { executeTool } from '@/lib/ai-tools';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_HISTORY = 40;

// H8: each turn burns paid LLM tokens. Cap per signed-in user (per instance —
// see lib/rate-limit.js for the serverless caveat).
const CHAT_RATE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };

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

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rate = checkRateLimit(`chat:${user.id}`, CHAT_RATE_LIMIT);

  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many messages — give BrandForge a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    );
  }

  let body: { conversationId?: string; message?: string } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const conversationId = String(body.conversationId ?? '').trim();
  const message = String(body.message ?? '').trim().slice(0, 8000);

  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  }

  const hasAccess = await canAccessConversation(user.id, conversationId);

  if (!hasAccess) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const aiService = getAIService();

  if (!aiService.isConfigured()) {
    return NextResponse.json(
      { error: 'BrandForge AI is unavailable: OPENROUTER_API_KEY is not configured' },
      { status: 503 }
    );
  }

  if (message) {
    const storedMessageId = await addMessage({
      conversation_id: conversationId,
      sender_type: 'user',
      sender_id: user.id,
      sender_name: getActorName(user),
      content: message,
      content_type: 'text',
    });

    if (!storedMessageId) {
      return NextResponse.json({ error: 'Your message could not be stored' }, { status: 500 });
    }
  }

  const snapshot = await getConversationSnapshot(conversationId);

  if (!snapshot) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const history = await getMessages(conversationId, { limit: MAX_HISTORY });
  const conversational = history.filter((entry) => entry.content_type !== 'system' && entry.content_type !== 'ai_draft');
  const lastMessage = conversational[conversational.length - 1];

  if (!lastMessage || lastMessage.sender_type !== 'user') {
    return NextResponse.json(
      { error: 'There is no founder message waiting for an answer' },
      { status: 400 }
    );
  }

  const modelMessages: AIMessage[] = [
    { role: 'system', content: buildStateBlock(snapshot) },
    ...conversational.map((entry) => ({
      role: entry.sender_type === 'user' ? ('user' as const) : ('assistant' as const),
      content: entry.content,
    })),
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      send({ type: 'start' });

      try {
        const answer = await aiService.chatWithToolHandling(
          modelMessages,
          (toolCall) => executeTool(conversationId, toolCall),
          { onDelta: (chunk) => send({ type: 'delta', chunk }) }
        );

        const content = answer.content.trim();

        if (content) {
          const assistantMessageId = await addMessage({
            conversation_id: conversationId,
            sender_type: 'ai',
            sender_name: 'BrandForge AI',
            content,
            content_type: 'ai_draft',
            artifact_data: { source: 'ai', status: 'pending' },
          });

          send({ type: 'message', id: assistantMessageId });
        }

        const discovery = await syncDiscoveryCompleteness(conversationId);
        let refreshed = await getConversationSnapshot(conversationId);

        // A project gets its name from the conversation itself, never from a placeholder.
        if (refreshed && (refreshed.title.trim().length === 0 || refreshed.title === 'New Project')) {
          const firstFounderMessage = conversational.find((entry) => entry.sender_type === 'user');
          const fallbackTitle = refreshed.context?.project_name || firstFounderMessage?.content || '';

          if (fallbackTitle.trim()) {
            await updateConversationTitle(conversationId, fallbackTitle.trim().slice(0, 60));
            refreshed = await getConversationSnapshot(conversationId);
          }
        }

        send({ type: 'state', state: buildClientState(refreshed, discovery) });
        send({ type: 'done' });
      } catch (error) {
        console.error('Chat turn failed:', error);
        send({
          type: 'error',
          error: error instanceof Error ? error.message : 'BrandForge AI could not answer',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
