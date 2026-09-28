export type DiscoveryMessage = {
  username: string;
  allowed_mentions: { parse: string[] };
  embeds: {
    title: string;
    url: string;
    description: string;
    color: number;
    footer: { text: string };
    timestamp: string;
  }[];
};

export function discoveryMessage(details: {
  title?: string | null;
  conversationId: string;
}): DiscoveryMessage;

export function notifyDiscordDiscovery(
  conversationId: string,
  title?: string | null
): Promise<{ skipped?: true; ok?: boolean }>;
