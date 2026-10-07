export type CreateFieldType = 'text' | 'textarea' | 'url' | 'select' | 'chips' | 'multi';

export interface CreateField {
  key: string;
  label: string;
  type: CreateFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  default?: string | string[];
}

export type CreateValues = Record<string, string | string[]>;

export interface CreateTool {
  id: string;
  group: string;
  label: string;
  hint: string;
  fields: CreateField[];
  example: CreateValues;
  build(values: CreateValues): string;
}

export declare const TOOLS: CreateTool[];
export declare const GROUPS: { id: string; label: string }[];
export declare const STYLES: string[];
export declare const TONES: string[];
export declare const FORMATS: string[];
export declare const REFERENCE_FIELD: CreateField;
export declare function getTool(id: string): CreateTool | null;
export declare function defaultValues(tool: CreateTool): CreateValues;
export declare function normalizeUrl(raw: unknown): string;
export declare function compile(
  toolId: string,
  values: CreateValues,
): { ok: true; prompt: string } | { ok: false; error: string; field: string | null };
