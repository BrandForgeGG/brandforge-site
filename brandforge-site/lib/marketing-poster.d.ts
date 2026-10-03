export declare const DISCORD_KIND_ENV: Record<string, string>;

export type ResolveResult =
  | { ok: true; url: string }
  | { ok: true; chatId: string; token: string }
  | { ok: false; terminal: boolean; error: string };

export declare function resolveDestination(
  channel: string,
  target: string,
  env: Record<string, string | undefined>
): ResolveResult;

export declare function discordPayload(post: {
  body: string;
  title?: string | null;
  url?: string | null;
}): { embeds: Record<string, unknown>[] };

export declare function telegramPayload(
  chatId: string,
  post: { body: string; title?: string | null; url?: string | null }
): { chat_id: string; text: string; disable_web_page_preview: boolean };

export type PublishResult = { ok: true } | { ok: false; terminal?: boolean; error: string };

export declare function publishPost(
  post: { channel: string; target: string; body: string; title?: string | null; url?: string | null },
  env: Record<string, string | undefined>,
  fetchImpl?: typeof fetch
): Promise<PublishResult>;
