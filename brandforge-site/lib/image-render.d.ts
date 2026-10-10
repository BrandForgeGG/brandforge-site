import type { ImageCopy, ImageFormat, ImageKind } from './image-kinds';
import type { CarouselOptions } from './carousel-render';
export declare function sizeOf(format: string): { w: number; h: number };
export declare function drawImagePost(ctx: CanvasRenderingContext2D, spec: { kind: ImageKind; format: ImageFormat; copy: ImageCopy }, options: CarouselOptions, art: CanvasImageSource | null): void;
