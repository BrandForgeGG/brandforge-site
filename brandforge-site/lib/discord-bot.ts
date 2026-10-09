import { botCommandPrompt, parseCallback, promptForKind, toPlainChat } from '@/lib/bot-core.js';
import { EPHEMERAL, answerComponents, menuComponents, modalFor, modalText } from '@/lib/discord-ui.js';
import { collectGeneratedImages, continueUrl, runBotTurn } from '@/lib/telegram-bot';
import { resolveSiteUrl } from '@/lib/auth-utils';

// Use BrandForge from Discord, with buttons, like the Telegram bot. `/brandforge` opens a menu of
// buttons; each button opens a small popup form with one question; the answer comes back with
// follow-up buttons (shorter, go deeper, turn into ads, what next, menu) and a link that opens the
// same chat on the web. Replies are private to the person who asked (ephemeral), so a channel is
// never filled with someone's project. The bot only ever answers an interaction somebody started.

export type DiscordInteraction = {
  type: number;
  application_id: string;
  token: string;
  member?: { user?: { id: string } };
  user?: { id: string };
  data?: {
    name?: string;
    custom_id?: string;
    options?: { name: string; value: string }[];
    components?: { components?: { custom_id: string; value?: string }[] }[];
  };
};

type Built = { prompt: string; forceNew: boolean; media: boolean };
export type Routed = { response: Record<string, unknown>; work?: () => Promise<void> };

const DEFERRED_PRIVATE = { type: 5, data: { flags: EPHEMERAL } };

function userIdOf(interaction: DiscordInteraction): string {
  return interaction.member?.user?.id ?? interaction.user?.id ?? '';
}

async function edit(interaction: DiscordInteraction, body: Record<string, unknown>) {
  try {
    await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed_mentions: { parse: [] }, ...body }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (cause) {
    console.warn('discord edit failed:', cause instanceof Error ? cause.message : cause);
  }
}

// Generated images arrive as extra private messages with the picture attached.
async function postImages(interaction: DiscordInteraction, conversationId: string, token: string) {
  for (const image of await collectGeneratedImages(conversationId, token)) {
    try {
      const form = new FormData();
      form.append('payload_json', JSON.stringify({ content: image.caption || '', flags: EPHEMERAL, allowed_mentions: { parse: [] }, attachments: [{ id: 0, filename: 'brandforge.png' }] }));
      form.append('files[0]', new Blob([image.bytes], { type: image.contentType }), 'brandforge.png');
      await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) });
    } catch (cause) {
      console.warn('discord image failed:', cause instanceof Error ? cause.message : cause);
    }
  }
}

async function deliver(interaction: DiscordInteraction, built: Built) {
  const userId = userIdOf(interaction);
  if (!userId) {
    await edit(interaction, { content: 'I could not tell who you are. Try the command again.' });
    return;
  }
  const result = await runBotTurn({ platform: 'discord', userId, prompt: built.prompt, forceNew: built.forceNew });
  if (!result.ok) {
    await edit(interaction, { content: result.message, components: menuComponents(resolveSiteUrl()) });
    return;
  }
  const reply = toPlainChat(result.text, 1800) || 'Done. Open the chat to see it.';
  const isVideo = built.media && /^create a video/i.test(built.prompt);
  await edit(interaction, {
    content: isVideo ? `${reply}\n\nOpen the full chat to turn the scenes into a video.` : reply,
    components: answerComponents(continueUrl(result.conversationId, result.token, 'discord')),
  });
  if (built.media) await postImages(interaction, result.conversationId, result.token);
}

function menuResponse(text = 'BrandForge: AI drafts, people finish.\nTap what you want to do.') {
  return { type: 4, data: { content: text, flags: EPHEMERAL, components: menuComponents(resolveSiteUrl()) } };
}

// Decides the immediate reply Discord needs within three seconds, plus the slower work to run after.
export function routeInteraction(interaction: DiscordInteraction): Routed {
  // 2 = slash command
  if (interaction.type === 2) {
    const options = Object.fromEntries((interaction.data?.options ?? []).map((o) => [o.name, o.value]));
    const request = String(options.request ?? '').trim();
    if (request.length < 3) return { response: menuResponse() };
    const built = botCommandPrompt(String(options.kind ?? 'chat'), request);
    return { response: DEFERRED_PRIVATE, work: () => deliver(interaction, { prompt: built.prompt, forceNew: false, media: built.media }) };
  }

  // 3 = a button press
  if (interaction.type === 3) {
    const parsed = parseCallback(interaction.data?.custom_id ?? '');
    if (!parsed || parsed.type === 'menu') return { response: menuResponse('What next?') };
    if (parsed.type === 'ask') {
      const modal = modalFor(parsed.kind);
      return { response: modal ?? menuResponse() };
    }
    return { response: DEFERRED_PRIVATE, work: () => deliver(interaction, { prompt: parsed.text, forceNew: false, media: false }) };
  }

  // 5 = a submitted popup form
  if (interaction.type === 5) {
    const parsed = parseCallback(interaction.data?.custom_id ?? '');
    const text = modalText(interaction);
    const built = parsed && parsed.type === 'ask' ? promptForKind(parsed.kind, text) : null;
    if (!built || text.length < 3) return { response: { type: 4, data: { content: 'Write a few words so I know what you need.', flags: EPHEMERAL, components: menuComponents(resolveSiteUrl()) } } };
    return { response: DEFERRED_PRIVATE, work: () => deliver(interaction, built) };
  }

  return { response: { type: 1 } };
}
