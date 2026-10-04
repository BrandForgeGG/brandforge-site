// Types for the dependency-free CommonJS Blueprint Engine config (lib/blueprint-config.js).

export interface BlueprintConfig {
  enabled: boolean;
  researchEnabled: boolean;
  extractModel: string;
  synthModel: string;
  maxSessionsPerIpPerHour: number;
  runsPerSessionPerDay: number;
  intakeMinChars: number;
  intakeMaxChars: number;
  llmTimeoutMs: number;
  sessionSecret: string;
  sessionCookieName: string;
  sessionTtlDays: number;
}

export declare function blueprintConfig(env?: NodeJS.ProcessEnv): BlueprintConfig;
export declare function envFlag(name: string, env?: NodeJS.ProcessEnv): boolean;
export declare function envInt(name: string, fallback: number, env?: NodeJS.ProcessEnv): number;
