import { botCommandPrompt, toPlainChat } from '@/lib/bot-core.js';
import { continueUrl, runBotTurn } from '@/lib/telegram-bot';

// Use BrandForge from Discord: /brandforge request:<text> [kind:<plan|ads|audit|calendar|launch|image|video>].
// The answer is posted back into the channel; a link button opens the full chat. The bot only
// ever replies to a command somebody ran.

export type DiscordInteraction = {
  type: number;
  application_id: string;
  token: string;
  member?: { user?: { id: string } };
  user?: { id: string };
  data?: { name?: string; options?: { name: string; value: string }[] };
};

async function followUp(interaction: DiscordInteraction, body: Record<string, unknown>) {
  try {
    await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed_mentions: { parse: [] }, ...body }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (cause) {
    console.warn('discord follow-up failed:', cause instanceof Error ? cause.message : cause);
  }
}

export async function handleDiscordCommand(interaction: DiscordInteraction) {
  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? '';
  const options = Object.fromEntries((interaction.data?.options ?? []).map((o) => [o.name, o.value]));
  const request = String(options.request ?? '').trim();
  const kind = String(options.kind ?? 'chat');
  if (!userId || request.length < 3) {
    await followUp(interaction, { content: 'Tell me what you want to build, like /brandforge request: a booking page for my yoga studio' });
    return;
  }

  const built = botCommandPrompt(kind, request);
  const result = await runBotTurn({ platform: 'discord', userId, prompt: built.prompt });
  if (!result.ok) {
    await followUp(interaction, { content: result.message });
    return;
  }
  const reply = toPlainChat(result.text, 1800) || 'Done. Open the chat to see it.';
  await followUp(interaction, {
    content: built.media ? `${reply}\n\nYour ${kind} is ready in the full chat.` : reply,
    components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Continue in BrandForge', url: continueUrl(result.conversationId, result.token, 'discord') }] }],
  });
}
