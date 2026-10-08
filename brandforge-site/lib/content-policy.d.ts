export const CATEGORIES: { id: string; label: string; pattern: RegExp }[];
export function screenText(
  text: unknown,
): { ok: true } | { ok: false; category: string; label: string; message: string };
