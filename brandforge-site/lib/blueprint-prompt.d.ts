// Types for the dependency-free CommonJS Blueprint modules.

// lib/blueprint-prompt.js
export declare const SYSTEM: string;
export declare function buildRunPrompt(input: {
  input: string;
  sources: Array<Record<string, unknown>>;
}): string;
export declare function buildRepairPrompt(input: {
  previousJson: string;
  errors: string[];
}): string;
export declare function parseModelJson(raw: unknown): Record<string, unknown> | null;
