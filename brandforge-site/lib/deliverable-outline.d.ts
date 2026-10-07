export interface AnswerOutline {
  goal: string | null;
  assumptions: string | null;
  sections: { title: string; items: number }[];
}
export declare function extractOutline(markdown: unknown): AnswerOutline | null;
