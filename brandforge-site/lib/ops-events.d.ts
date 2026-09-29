// Types for the dependency-free CommonJS ops event layer (lib/ops-events.js).

export interface OpsEmbed {
  title: string;
  description: string;
  color: number;
  footer: { text: string };
}

export type OpsDetails = Record<string, unknown>;

export interface OpsSendOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface OpsSendResult {
  sent: boolean;
  ok?: boolean;
  reason?: string;
}

export declare function buildOpsEmbed(event: string, details?: OpsDetails): OpsEmbed | null;

export declare function buildPublicPost(event: string): string | null;

export declare function opsWebhookUrl(kind: string, env?: NodeJS.ProcessEnv): string | null;

export declare function postOpsEvent(
  event: string,
  details?: OpsDetails,
  opts?: OpsSendOptions
): Promise<OpsSendResult>;

export declare function postPublicActivity(
  event: string,
  opts?: OpsSendOptions
): Promise<OpsSendResult>;

export declare function postDevLog(
  post: { title?: string; description?: string; url?: string },
  opts?: OpsSendOptions
): Promise<OpsSendResult>;

export declare function postLiveMessage(
  text: string,
  opts?: OpsSendOptions
): Promise<OpsSendResult>;

export declare function weeks(min: unknown, max: unknown): string | null;
