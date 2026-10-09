import { blueprintConfig } from '@/lib/blueprint-config';
import { createSessionToken } from '@/lib/blueprint-session';
import { ensureBlueprintSessionWithId, getSessionConversationSummaries } from '@/lib/project-db';
import { ASK, FOLLOWUPS, MENU, botSessionId, collectStreamText, commandToPrompt, kindFromPrompt, parseCallback, parseCommand, parseIdList, promptForKind, toPlainChat } from '@/lib/bot-core.js';
import { resolveSiteUrl } from '@/lib/auth-utils';

// Use BrandForge from Telegram, with buttons. A menu of buttons asks one short question each; the
// answer comes back as text (and images) with follow-up buttons under it, and one button opens the
// same chat on the web. Typing works too. Nothing here messages anyone who has not written first.

const RECENT_CHAT_WINDOW_MS = 6 * 60 * 60 * 1000;

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

export function continueUrl(conversationId: string, token: string, via: 'telegram' | 'discord' = 'telegram'): string {
  return `${origin()}/api/blueprint/return?token=${encodeURIComponent(token)}&conversationId=${encodeURIComponent(conversationId)}&via=${via}`;
}

export const BOT_WELCOME = 'BrandForge: AI drafts, people finish.\n\nTap what you want to do, or just write it and I will answer here.';

type Button = { text: string; callback_data?: string; url?: string };

function menuKeyboard(): { inline_keyboard: Button[][] } {
  const rows: Button[][] = MENU.map((row: [string, string][]) => row.map(([label, kind]) => ({ text: label, callback_data: `ask:${kind}` })));
  rows.push([
    { text: 'Link my account', callback_data: 'ask:link' },
    { text: 'Open BrandForge', url: origin() },
  ]);
  return { inline_keyboard: rows };
}

function answerKeyboard(url: string): { inline_keyboard: Button[][] } {
  const tap = (id: keyof typeof FOLLOWUPS): Button => ({ text: FOLLOWUPS[id].label, callback_data: `do:${id}` });
  return {
    inline_keyboard: [
      [tap('shorter'), tap('deeper'), tap('ads')],
      [tap('next'), { text: 'Menu', callback_data: 'menu' }],
      [{ text: 'Continue in BrandForge', url }],
    ],
  };
}

export async function sendMenu(chatId: string, text: string = BOT_WELCOME) {
  await telegram('sendMessage', { chat_id: chatId, text, reply_markup: menuKeyboard() });
}

// One short question; the reply to it says which button was pressed (see lib/bot-core.js).
async function askFor(chatId: string, kind: string) {
  await telegram('sendMessage', {
    chat_id: chatId,
    text: ASK[kind],
    reply_markup: { force_reply: true, input_field_placeholder: 'Type here', selective: true },
  });
}

// Generated images from this turn (up to four), downloaded with the person's own guest session.
// Shared by the Telegram and Discord bots. Videos are assembled in the browser, so for those the
// scenes arrive here and a button opens the full chat.
export type BotImage = { bytes: ArrayBuffer; contentType: string; caption: string };

export async function collectGeneratedImages(conversationId: string, token: string): Promise<BotImage[]> {
  const config = blueprintConfig();
  const cookie = `${config.sessionCookieName}=${token}`;
  const found: BotImage[] = [];
  try {
    const list = await fetch(`${origin()}/api/messages?conversationId=${encodeURIComponent(conversationId)}&limit=12`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(15000) });
    const data = (await list.json().catch(() => ({}))) as { messages?: { sender_type: string; artifact_data?: { path?: string; contentType?: string; generated?: boolean; caption?: string } | null }[] };
    const rows = data.messages ?? [];
    const lastUser = rows.map((row) => row.sender_type).lastIndexOf('user');
    const images = rows
      .slice(lastUser + 1)
      .map((row) => row.artifact_data)
      .filter((art): art is NonNullable<typeof art> => Boolean(art && art.generated && art.path && String(art.contentType ?? '').startsWith('image/')))
      .slice(0, 4);
    for (const art of images) {
      const file = await fetch(`${origin()}/api/attachments?path=${encodeURIComponent(art.path!)}`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(20000) });
      if (!file.ok) continue;
      found.push({ bytes: await file.arrayBuffer(), contentType: art.contentType || 'image/png', caption: String(art.caption ?? '').slice(0, 200) });
    }
  } catch (cause) {
    console.warn('bot image collection failed:', cause instanceof Error ? cause.message : cause);
  }
  return found;
}

async function sendGeneratedImages(chatId: string, conversationId: string, token: string) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  for (const image of await collectGeneratedImages(conversationId, token)) {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (image.caption) form.append('caption', image.caption);
    form.append('photo', new Blob([image.bytes], { type: image.contentType }), 'brandforge.png');
    await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) }).catch(() => undefined);
  }
}

async function deliver(chatId: string, userId: string, built: { prompt: string; forceNew: boolean; media: boolean }) {
  await telegram('sendChatAction', { chat_id: chatId, action: 'typing' });
  const result = await runBotTurn({ platform: 'telegram', userId, prompt: built.prompt, forceNew: built.forceNew });
  if (!result.ok) {
    await telegram('sendMessage', { chat_id: chatId, text: result.message, reply_markup: menuKeyboard() });
    return;
  }
  if (built.media) await sendGeneratedImages(chatId, result.conversationId, result.token);
  const reply = toPlainChat(result.text) || 'Done. Open the chat to see it.';
  await telegram('sendMessage', {
    chat_id: chatId,
    text: built.media && /^create a video/i.test(built.prompt) ? `${reply}\n\nOpen the full chat to turn the scenes into a video.` : reply,
    disable_web_page_preview: true,
    reply_markup: answerKeyboard(continueUrl(result.conversationId, result.token)),
  });
}

// A button press. Telegram needs an answer within seconds; the work follows.
export async function handleTelegramCallback(input: { callbackId: string; chatId: string; userId: string; data: string }) {
  await telegram('answerCallbackQuery', { callback_query_id: input.callbackId });
  const parsed = parseCallback(input.data);
  if (!parsed) return;
  if (parsed.type === 'menu') return sendMenu(input.chatId, 'What next?');
  if (parsed.type === 'ask') return askFor(input.chatId, parsed.kind);
  await deliver(input.chatId, input.userId, { prompt: parsed.text, forceNew: false, media: false });
}

// A typed message, a shortcut command, or the answer to one of the menu questions.
export async function handleTelegramMessage(message: { chatId: string; userId: string; text: string; isPrivate: boolean; replyToText?: string | null }) {
  const { chatId, userId, text, isPrivate, replyToText } = message;

  const answered = kindFromPrompt(replyToText);
  if (answered && answered !== 'link') {
    const built = promptForKind(answered, text);
    if (built) return deliver(chatId, userId, built);
  }

  const command = parseCommand(text);
  if (command) {
    if (command.name === 'new' && command.args.length >= 3) return deliver(chatId, userId, { prompt: command.args, forceNew: true, media: false });
    const built = commandToPrompt(command);
    if (built && built.ok) return deliver(chatId, userId, { prompt: built.prompt, forceNew: false, media: built.media });
    return sendMenu(chatId); // unknown or incomplete shortcut: show the buttons
  }

  if (!isPrivate) return; // in groups the bot answers buttons and shortcuts, not chatter
  await deliver(chatId, userId, { prompt: text.trim(), forceNew: false, media: false });
}
