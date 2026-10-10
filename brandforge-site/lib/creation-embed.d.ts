export type CarouselEmbedFields = {
  plan: {
    cover: { headline: string; subtitle: string; scene?: string };
    items: { n: number; name: string; bullets: string[] }[];
    cta: { headline: string; button: string; note: string };
  };
  theme: string;
  coverStyle: string;
  brand: { name: string; handle: string; accent: string };
  cta: string;
  topic: string;
  coverUrl?: string;
};
export declare const THEMES: string[];
export declare const COVER_STYLES: string[];
export declare function sanitizeCarousel(input: unknown): CarouselEmbedFields | null;
