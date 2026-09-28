export type StageEmail = {
  subject: string;
  text: string;
  html: string;
};

export function buildStageEmail(
  event: string,
  details?: Record<string, unknown>
): StageEmail | null;
