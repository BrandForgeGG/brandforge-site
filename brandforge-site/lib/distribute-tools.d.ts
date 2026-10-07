import type { CreateField, CreateTool, CreateValues } from './create-tools';

export declare const TOOLS: CreateTool[];
export declare const GROUPS: { id: string; label: string }[];
export declare const REFERENCE_FIELD: CreateField;
export declare function getTool(id: string): CreateTool | null;
export declare function defaultValues(tool: CreateTool): CreateValues;
export declare function normalizeUrl(raw: unknown): string;
export declare function compile(
  toolId: string,
  values: CreateValues,
): { ok: true; prompt: string } | { ok: false; error: string; field: string | null };
