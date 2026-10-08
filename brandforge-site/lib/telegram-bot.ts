import { blueprintConfig } from '@/lib/blueprint-config';
import { createSessionToken } from '@/lib/blueprint-session';
import { ensureBlueprintSessionWithId, getSessionConversationSummaries } from '@/lib/project-db';
import { botSessionId, collectStreamText, commandToPrompt, parseCommand, parseIdList, toPlainChat } from '@/lib/bot-core.js';
import { resolveSiteUrl } from '@/lib/auth-utils';

// Use BrandForge from Telegram. A person writes to the bot; their messages become a guest chat
// (the same one they can open on the web), the answer comes back as plain text, and a button
// opens the full chat with everything in it. Nothing here messages anyone who has not written first.

const RECENT_CHAT_WINDOW_MS = 6 * 60 * 60 * 1000;

export const BOT_HELP =
  'BrandForge: AI drafts, people finish.\n\n' +
  'Just write what you want to build and I will answer here. Or use a shortcut:\n' +
  '/plan your idea\n/audit https://yoursite.com\n/ads what you are advertising\n/calendar your business\n/launch what you are launching\n/image what to show\n/video what it is about\n\n' +
  '/new starts a fresh chat. /link CODE links your BrandForge account for updates. Images and videos open in the full chat.';

async function telegram(method: string, body: Record<string, unknown>) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!token) return null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    return (await response.json().catch(() => null)) as { ok?: boolean } | null;
  } catch {
    return null;
  }
}

function origin(): string {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || 'https://brandforge.gg');
}

async function callSite(path: string, token: string, body: Record<string, unknown>): Promise<Response> {
  const config = blueprintConfig();
  return fetch(`${origin()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `${config.sessionCookieName}=${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55000),
  });
}

// One turn: find or open this person's recent chat, send the message, return the answer text.
export async function runBotTurn(options: {
  platform: 'telegram' | 'discord';
  userId: string;
  prompt: string;
  forceNew?: boolean;
}): Promise<{ ok: true; text: string; conversationId: string; token: string } | { ok: false; message: string }> {
  const config = blueprintConfig();
  if (!config.enabled || !config.sessionSecret) return { ok: false, message: 'BrandForge chat is not available right now. Try again soon.' };

  const sessionId = botSessionId(options.platform, options.userId, config.sessionSecret);
  if (!(await ensureBlueprintSessionWithId(sessionId))) return { ok: false, message: 'Could not start your chat. Try again in a moment.' };
  const token = createSessionToken(sessionId, config.sessionSecret);
  const isTest = parseIdList(process.env[`TEST_${options.platform.toUpperCase()}_IDS`]).includes(options.userId);

  let conversationId: string | null = null;
  if (!options.forceNew) {
    const recent = (await getSessionConversationSummaries(sessionId))[0];
    if (recent && Date.now() - new Date(recent.lastActivity ?? 0).getTime() < RECENT_CHAT_WINDOW_MS) {
      conversationId = recent.id;
    }
  }

  let streamBody: Record<string, unknown>;
  if (conversationId) {
    streamBody = { conversationId, message: options.prompt };
  } else {
    const created = await callSite('/api/conversations', token, { initialMessage: options.prompt, guest: true, source: isTest ? 'test' : options.platform });
    const data = (await created.json().catch(() => ({}))) as { conversationId?: string; error?: string };
    if (!created.ok || !data.conversationId) return { ok: false, message: data.error || 'Could not start your chat. Try again in a moment.' };
    conversationId = data.conversationId;
    streamBody = { conversationId };
  }

  const answer = await callSite('/api/chat', token, streamBody);
  if (!answer.ok) {
    const data = (await answer.json().catch(() => ({}))) as { error?: string };
    return { ok: false, message: data.error || 'The assistant could not answer. Try again in a moment.' };
  }
  const { text, error } = collectStreamText(await answer.text());
  if (error && !text) return { ok: false, message: error };
  return { ok: true, text, conversationId, token };
}

export function continueUrl(conversationId: string, token: string): string {
  return `${origin()}/api/blueprint/return?token=${encodeURIComponent(token)}&conversationId=${encodeURIComponent(conversationId)}`;
}

// Handles one private message or command. Runs after the webhook has already answered Telegram.
export async function handleTelegramMessage(message: { chatId: string; userId: string; text: string; isPrivate: boolean }) {
  const { chatId, userId, text, isPrivate } = message;
  const command = parseCommand(text);

  let prompt = text.trim();
  let forceNew = false;
  let media = false;

  if (command) {
    if (command.name === 'new') {
      forceNew = true;
      if (command.args.length < 3) {
        await telegram('sendMessage', { chat_id: chatId, text: 'Start a fresh chat by adding what you want to build: /new a booking page for my studio' });
        return;
      }
      prompt = command.args;
    } else {
      const built = commandToPrompt(command);
      if (!built) {
        await telegram('sendMessage', { chat_id: chatId, text: BOT_HELP });
        return;
      }
      if (!built.ok) {
        await telegram('sendMessage', { chat_id: chatId, text: `Add ${built.needs} after the command, like /${command.name} …` });
        return;
      }
      prompt = built.prompt;
      media = built.media;
    }
  } else if (!isPrivate) {
    return; // in groups the bot only answers commands
  }

  await telegram('sendChatAction', { chat_id: chatId, action: 'typing' });
  const result = await runBotTurn({ platform: 'telegram', userId, prompt, forceNew });
  if (!result.ok) {
    await telegram('sendMessage', { chat_id: chatId, text: result.message });
    return;
  }

  const reply = toPlainChat(result.text) || 'Done. Open the chat to see it.';
  await telegram('sendMessage', {
    chat_id: chatId,
    text: media ? `${reply}\n\nYour ${prompt.toLowerCase().startsWith('create a video') ? 'video' : 'image'} is ready in the full chat.` : reply,
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: 'Continue in BrandForge', url: continueUrl(result.conversationId, result.token) }]] },
  });
}
