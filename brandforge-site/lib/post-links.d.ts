export function postUrl(kind: string, channel: { label?: string; meta?: Record<string, unknown> } | null, result: { ok: boolean; url?: string; ref?: string } | null): string | null;
