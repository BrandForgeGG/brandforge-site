export type PictureShape = 'portrait' | 'wide' | 'square';
export type NetworkSpec = { label: string; shape: PictureShape; ratio: string; limit: number; tags: number };
export const NETWORKS: Record<string, NetworkSpec>;
export function networkOf(kind: string): NetworkSpec;
export function splitTags(caption: string): { body: string; tags: string[] };
export function cutText(text: string, max: number): string;
export function fitCaption(kind: string, caption: string): string;
export function versionsFor(
  channelIds: string[],
  kinds: Record<string, string>,
  caption: string,
  singlePicture: boolean
): { shape: PictureShape | 'native'; caption: string; channelIds: string[] }[];
