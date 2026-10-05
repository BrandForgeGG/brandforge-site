// Types for the dependency-free CommonJS Blueprint modules.

// lib/blueprint-prompt.js
export interface ResearchPage {
  url: string;
  title: string;
  text?: string;
  snippet?: string;
}
export declare const SYSTEM: string;
export declare function buildRunPrompt(input: {
  input: string;
  sources: Array<Record<string, unknown>>;
  research?: ResearchPage[];
  researchHeader?: string;
}): string;
export declare function buildRefinePrompt(input: {
  input: string;
  sources: Array<Record<string, unknown>>;
  document: Record<string, unknown>;
  note: string;
}): string;
export declare function buildRepairPrompt(input: {
  previousJson: string;
  errors: string[];
}): string;
export declare function parseModelJson(raw: unknown): Record<string, unknown> | null;
export declare function carriedResearch(document: unknown): ResearchPage[];
