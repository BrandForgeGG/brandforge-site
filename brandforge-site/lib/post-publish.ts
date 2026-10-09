import { decryptSecret } from '@/lib/secret-box.js';
import { blueskySession } from '@/lib/carousel-channels';
import type { PublishResult } from '@/lib/carousel-publish';
import type { CarouselChannelRow } from '@/lib/project-db';
import { blueskyPosts, discordEmbed, numbered, slackMessages, telegramText, type Post } from '@/lib/post-types.js';
import { postToTumblr } from '@/lib/tumblr';

// Sends an update, poll, quiz or thread to a channel the person linked. Each platform gets the closest
// native form: Telegram polls and quizzes are real polls, Discord polls are real polls, and Bluesky
// (which has no polls) gets the question as a post people reply to. Every call reports plainly what
// happened and never throws.

const BSKY = 'https://bsky.social/xrpc';
const DISCORD_HOOK = /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/;

async function telegram(chatId: string, method: string, body: Record<string, unknown>): Promise<PublishResult> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!token) return { ok: false, note: 'No Telegram bot token is set.' };
  if (!chatId) return { ok: false, note: 'No Telegram channel is set.' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, ...body }), signal: AbortSignal.timeout(20000) });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { description?: string };
    return { ok: false, note: `Telegram said: ${String(data.description ?? res.status).slice(0, 160)}` };
  } catch {
    return { ok: false, note: 'Could not reach Telegram.' };
  }
}

export async function postToTelegram(chatId: string, post: Post): Promise<PublishResult> {
  if (post.type === 'poll') return telegram(chatId, 'sendPoll', { question: post.question, options: post.options, is_anonymous: true, allows_multiple_answers: false });
  if (post.type === 'quiz') {
    return telegram(chatId, 'sendPoll', {
      question: post.question,
      options: post.options,
      type: 'quiz',
      correct_option_id: post.correct,
      is_anonymous: true,
      ...(post.explanation ? { explanation: post.explanation.slice(0, 200) } : {}),
    });
  }
  return telegram(chatId, 'sendMessage', { text: telegramText(post), parse_mode: 'HTML' });
}

export async function postToDiscord(webhookUrl: string, post: Post): Promise<PublishResult> {
  if (!DISCORD_HOOK.test(webhookUrl)) return { ok: false, note: 'That is not a Discord webhook address.' };
  let payload: Record<string, unknown>;
  if (post.type === 'poll' || post.type === 'quiz') {
    // Discord has no quiz. A quiz becomes a poll, with the answer hidden behind a spoiler.
    const reveal = post.type === 'quiz' ? `Answer: ||${post.correct + 1}. ${post.options[post.correct]}${post.explanation ? ` (${post.explanation})` : ''}||` : undefined;
    payload = {
      username: 'BrandForge',
      allowed_mentions: { parse: [] },
      ...(reveal ? { content: reveal.slice(0, 1800) } : {}),
      poll: { question: { text: post.question.slice(0, 300) }, answers: post.options.map((text) => ({ poll_media: { text: text.slice(0, 55) } })), duration: 24, allow_multiselect: false },
    };
  } else {
    payload = { username: 'BrandForge', allowed_mentions: { parse: [] }, embeds: [discordEmbed(post)] };
  }
  try {
    const res = await fetch(`${webhookUrl}?wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
    if (res.ok) return { ok: true };
    // A server that does not accept webhook polls still gets the question, as a plain message.
    if (res.status === 400 && (post.type === 'poll' || post.type === 'quiz')) {
      const fallback = `**${post.question}**\n${numbered(post.options)}${post.type === 'quiz' ? `\n\nAnswer: ||${post.correct + 1}. ${post.options[post.correct]}||` : ''}`;
      const again = await fetch(`${webhookUrl}?wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'BrandForge', allowed_mentions: { parse: [] }, content: fallback.slice(0, 1900) }), signal: AbortSignal.timeout(20000) });
      return again.ok ? { ok: true, note: 'Posted as a message: Discord would not take a poll here.' } : { ok: false, note: `Discord said: ${again.status}` };
    }
    return { ok: false, note: `Discord said: ${res.status}` };
  } catch {
    return { ok: false, note: 'Could not reach Discord.' };
  }
}

export async function postToSlack(webhookUrl: string, post: Post): Promise<PublishResult> {
  if (!/^https:\/\/hooks\.slack\.com\/services\//.test(webhookUrl)) return { ok: false, note: 'That is not a Slack webhook address.' };
  try {
    for (const message of slackMessages(post)) {
      const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message), signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { ok: false, note: `Slack said: ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, note: 'Could not reach Slack.' };
  }
}

export async function postToBluesky(handle: string, password: string, post: Post): Promise<PublishResult> {
  const session = await blueskySession(handle, password);
  if (!session) return { ok: false, note: 'Bluesky did not accept the saved login. Link it again.' };
  const auth = { Authorization: `Bearer ${session.accessJwt}`, 'Content-Type': 'application/json' };
  let root: { uri: string; cid: string } | null = null;
  let parent: { uri: string; cid: string } | null = null;
  try {
    for (const part of blueskyPosts(post)) {
      const record: Record<string, unknown> = {
        $type: 'app.bsky.feed.post',
        text: part.text,
        createdAt: new Date().toISOString(),
        ...(part.facets.length ? { facets: part.facets } : {}),
        ...(root && parent ? { reply: { root, parent } } : {}),
      };
      const made = await fetch(`${BSKY}/com.atproto.repo.createRecord`, { method: 'POST', headers: auth, body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }), signal: AbortSignal.timeout(20000) });
      if (!made.ok) return { ok: false, note: `Bluesky refused the post (${made.status}).` };
      const created = (await made.json()) as { uri: string; cid: string };
      root = root ?? created;
      parent = created;
    }
    return { ok: true };
  } catch {
    return { ok: false, note: 'Could not reach Bluesky.' };
  }
}

export async function publishPostToChannel(channel: CarouselChannelRow, post: Post): Promise<PublishResult> {
  if (channel.kind === 'telegram') return postToTelegram(String(channel.meta.chatId ?? ''), post);
  if (channel.kind === 'tumblr') return postToTumblr(channel, post);
  const secret = channel.secret ? decryptSecret(channel.secret) : null;
  if (!secret) return { ok: false, note: 'The saved login could not be read. Link this channel again.' };
  if (channel.kind === 'discord') return postToDiscord(secret, post);
  if (channel.kind === 'slack') return postToSlack(secret, post);
  return postToBluesky(String(channel.meta.handle ?? ''), secret, post);
}
