export declare function detectMakeIntent(text: string | null | undefined): { kind: 'carousel' | 'poll' | 'quiz' | 'thread' | 'update'; topic: string } | null;
