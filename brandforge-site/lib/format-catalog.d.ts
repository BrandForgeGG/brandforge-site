export type FormatStatus = 'live' | 'setup' | 'approval' | 'building';
export type FormatTool = { kind: 'carousel' } | { kind: 'post'; type: 'update' | 'poll' | 'quiz' | 'thread'; platform: 'telegram' | 'discord' | 'bluesky' | 'slack' | 'tumblr' };
export interface Format {
  n: number;
  group: string;
  platform: string;
  name: string;
  line: string;
  status: FormatStatus;
  tool?: FormatTool;
}
export declare const GROUPS: { id: string; label: string }[];
export declare const FORMATS: Format[];
export declare const STATUS_LABEL: Record<FormatStatus, string>;
