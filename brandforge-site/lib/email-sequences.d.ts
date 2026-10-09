export declare const KINDS: string[];
export declare const STEPS: { kind: string; afterDays: number; windowDays: number }[];
export declare function nextSequenceEmail(person: {
  createdAt: string | Date;
  optIn: boolean;
  hasCarousel?: boolean;
  hasChat?: boolean;
  sent?: Iterable<string>;
  lastSentAt?: string | Date | null;
  now?: Date;
}): string | null;
