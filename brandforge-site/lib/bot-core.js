'use strict';

// Pure pieces of the chat bots (Telegram now, Discord next): one person on a chat app maps to one
// guest session, commands map to the same starting phrases the web Actions menu uses, and answers
// are flattened to plain text a chat app can show. No I/O here, so it is all unit-tested.

const crypto = require('crypto');

// A stable session id for a person on a platform: the same Telegram user always lands in the
// same guest session (and so the same recent chat), and the id can't be guessed without the secret.
function botSessionId(platform, userId, secret) {
  const hex = crypto.createHmac('sha256', String(secret)).update(`${platform}:${userId}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4'; // version 4 shape
  hex[16] = '89ab'[parseInt(hex[16], 16) % 4];
  const flat = hex.join('');
  return `${flat.slice(0, 8)}-${flat.slice(8, 12)}-${flat.slice(12, 16)}-${flat.slice(16, 20)}-${flat.slice(20, 32)}`;
}

const COMMANDS = {
  plan: { needs: 'your idea', build: (text) => `Make a researched plan with scope, roadmap, risks and a realistic estimate: ${text}` },
  ads: { needs: 'what you are advertising', build: (text) => `Write ads for ${text}` },
  audit: { needs: 'a web address', build: (text) => `Audit this site and tell me what to fix first: ${text}` },
  image: { needs: 'what the image should show', build: (text) => `Create an image: ${text}`, media: true },
  video: { needs: 'what the video is about', build: (text) => `Create a video: ${text}`, media: true },
  calendar: { needs: 'your business', build: (text) => `Build a 30-day content calendar for: ${text}` },
  launch: { needs: 'what you are launching', build: (text) => `Make a launch plan for ${text}` },
};

// "/plan@BrandForgeBot a bakery site" -> { name: 'plan', args: 'a bakery site' }
function parseCommand(text) {
  const match = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(String(text || '').trim());
  if (!match) return null;
  return { name: match[1].toLowerCase(), args: (match[2] || '').trim() };
}

// Turns a parsed command into the message to send to the chat, or says what is missing.
function commandToPrompt(command) {
  const spec = COMMANDS[command.name];
  if (!spec) return null;
  if (command.args.length < 3) return { ok: false, needs: spec.needs, media: Boolean(spec.media) };
  return { ok: true, prompt: spec.build(command.args), media: Boolean(spec.media) };
}

// Discord offers the same shortcuts as a dropdown: kind + request text.
function botCommandPrompt(kind, text) {
  const spec = COMMANDS[String(kind || '').toLowerCase()];
  if (!spec) return { prompt: String(text).trim(), media: false };
  return { prompt: spec.build(String(text).trim()), media: Boolean(spec.media) };
}

// Link codes look like "k7m2q9xd": eight characters with a digit. Ordinary eight-letter words
// are not mistaken for one.
function looksLikeLinkCode(text) {
  const value = String(text || '').trim();
  return /^[a-z0-9]{8}$/i.test(value) && /\d/.test(value);
}

// Markdown to the plain text a chat app shows well; capped under Telegram's 4096 limit.
function toPlainChat(markdown, limit = 3500) {
  let text = String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, '').trim())
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\|?[\s:|-]{3,}\|?$/gm, '')
    .replace(/^\|(.+)\|$/gm, (_m, row) => row.split('|').map((cell) => cell.trim()).filter(Boolean).join(' · '))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length > limit) {
    const cut = text.slice(0, limit);
    text = `${cut.slice(0, Math.max(cut.lastIndexOf('\n'), limit - 300))}\n\n…`;
  }
  return text;
}

// Collects the text of a chat stream (server-sent events: data: {"type":"chunk","chunk":"…"}).
function collectStreamText(sseText) {
  let out = '';
  let error = null;
  for (const frame of String(sseText || '').split('\n\n')) {
    const line = frame.split('\n').find((entry) => entry.startsWith('data:'));
    if (!line) continue;
    let payload;
    try {
      payload = JSON.parse(line.slice(5).trim());
    } catch {
      continue;
    }
    if (payload.type === 'discard') out = '';
    else if (payload.type === 'chunk' && typeof payload.chunk === 'string') out += payload.chunk;
    else if (payload.type === 'error') error = payload.error || 'The assistant could not answer.';
  }
  return { text: out, error };
}

// ---- Buttons instead of commands ----------------------------------------------------------
// Each menu button asks one short question (a Telegram force-reply). The question text is the only
// state: when the reply arrives, the text it answers says which button was pressed, so nothing is
// stored and nothing can go stale.
const ASK = {
  plan: "What's your idea?",
  audit: 'Which website should I audit? Send the address.',
  ads: 'What are you advertising?',
  calendar: "What's the business?",
  launch: 'What are you launching?',
  image: 'What should the image show?',
  video: 'What is the video about?',
  new: 'What do you want to build? This starts a fresh chat.',
  link: 'Paste the 8-character code from BrandForge Settings, Connect Telegram.',
};

// Menu rows: label and the kind each button asks about.
const MENU = [
  [['Plan an idea', 'plan'], ['Audit a site', 'audit']],
  [['Write ads', 'ads'], ['30-day calendar', 'calendar']],
  [['Launch plan', 'launch'], ['Make an image', 'image']],
  [['Make a video', 'video'], ['Fresh chat', 'new']],
];

// Buttons shown under every answer.
const FOLLOWUPS = {
  shorter: { label: 'Shorter', text: 'Make that shorter and sharper. Keep only what matters.' },
  deeper: { label: 'Go deeper', text: 'Go deeper on the most important part.' },
  ads: { label: 'Turn into ads', text: 'Turn this into ad copy for Meta and TikTok.' },
  next: { label: 'What next?', text: 'What should I do next, in order?' },
};

function askPrompt(kind) {
  return ASK[kind] || null;
}

// The kind a reply is answering, from the text of the question it replies to.
function kindFromPrompt(replyToText) {
  const text = String(replyToText || '').trim();
  return Object.keys(ASK).find((kind) => ASK[kind] === text) || null;
}

// What to send to the chat for an answered question.
function promptForKind(kind, text) {
  if (kind === 'new') return { prompt: String(text).trim(), forceNew: true, media: false };
  const spec = COMMANDS[kind];
  if (!spec) return null;
  return { prompt: spec.build(String(text).trim()), forceNew: false, media: Boolean(spec.media) };
}

// Callback data is short and structured: "menu", "ask:plan", "do:shorter".
function parseCallback(data) {
  const value = String(data || '');
  if (value === 'menu') return { type: 'menu' };
  const [head, tail] = value.split(':');
  if (head === 'ask' && ASK[tail] && tail !== 'link') return { type: 'ask', kind: tail };
  if (head === 'ask' && tail === 'link') return { type: 'ask', kind: 'link' };
  if (head === 'do' && FOLLOWUPS[tail]) return { type: 'do', id: tail, text: FOLLOWUPS[tail].text };
  return null;
}

function parseIdList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

module.exports = { ASK, MENU, FOLLOWUPS, askPrompt, kindFromPrompt, promptForKind, parseCallback, botSessionId, COMMANDS, parseCommand, commandToPrompt, botCommandPrompt, looksLikeLinkCode, toPlainChat, collectStreamText, parseIdList };
