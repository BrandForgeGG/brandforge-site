export function maskEmail(email: string | null | undefined): string;

export function isFreshSignup(createdAt: string | null | undefined, now?: number): boolean;

export function buildRegistrationPayload(opts?: {
  email?: string | null;
  memberCount?: number | null;
  when?: Date | string;
}): {
  username: string;
  allowed_mentions: { parse: never[] };
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline: boolean }>;
    footer: { text: string };
    timestamp: string;
  }>;
};

export function postRegistrationNotice(opts?: {
  email?: string | null;
  memberCount?: number | null;
  when?: Date | string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<{ sent: boolean; reason?: string }>;
