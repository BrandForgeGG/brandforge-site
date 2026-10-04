// Types for the dependency-free CommonJS Blueprint schema module (lib/blueprint-schema.js).

export type BlueprintLane = 'deliver_now' | 'scope_first' | 'reframe' | 'decline' | 'needs_review';
export type BlueprintStatus = 'draft' | 'validated' | 'saved' | 'proposed';

export interface BlueprintDocument extends Record<string, unknown> {
  version: number;
  status: BlueprintStatus;
  createdAt: string;
  lane: string;
  confidence: string | null;
  mirror: string;
  sources: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
  blocks: Array<Record<string, unknown>>;
  quickWins: Array<Record<string, unknown>>;
  clarifyingQuestion: Record<string, unknown> | null;
  exits: string[];
  ethics: { status: string; checks: Array<Record<string, unknown>> };
  cost: { tokensIn: number; tokensOut: number; searches: number; usdEstimate: number };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export declare const LANES: readonly string[];
export declare const CONFIDENCES: readonly string[];
export declare const STATUSES: readonly string[];
export declare const SOURCE_KINDS: readonly string[];
export declare const BLOCK_ORDER: readonly string[];
export declare const ESTIMATE_LABEL: 'AI draft, not final';
export declare const FINDINGS_MAX: 3;
export declare const MIRROR_MAX_WORDS: 30;
export declare const FINDING_MAX_WORDS: 9;
export declare const HEADLINE_MAX_WORDS: 12;

export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
export declare function words(value: unknown): number;
export declare function hasGuaranteeLanguage(value: unknown): boolean;
export declare function exitsForLane(lane: string | null | undefined, quickWinCount?: number): string[];
export declare function seedBlueprintDocument(input: string): { input: string; sources: Array<Record<string, unknown>> };
export declare function normalizeBlueprint(
  raw: unknown,
  options?: {
    version?: number;
    cost?: { tokensIn?: number; tokensOut?: number; searches?: number; usdEstimate?: number } | null;
    now?: number;
  }
): BlueprintDocument | null;
export declare function validateBlueprint(
  doc: unknown,
  context?: { fetchedUrls?: string[] }
): ValidationResult;
