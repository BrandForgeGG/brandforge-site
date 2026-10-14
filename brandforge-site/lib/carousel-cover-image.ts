import { generateImage } from '@/lib/image-gen';
import { buildCoverPrompt } from '@/lib/carousel-cover.js';

// Makes the cover picture for a carousel. The free Cloudflare model comes first; the keyless
// fallback is left out on purpose because it stamps its own watermark onto the picture, and a
// carousel never carries anyone's mark but its owner's. No picture is a normal answer: the slide
// then uses the drawn art.
export type CoverAspect = 'portrait' | 'story' | 'wide' | 'square';

export async function makeCoverImage(input: { scene?: string; headline?: string; style?: string; variant?: number; aspect?: CoverAspect; fast?: boolean }): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const prompt = buildCoverPrompt(input);
  if (!prompt) return null;
  // Video scenes (fast) come several at once, so they use the cheap, quick model first; a cover gets the best one first.
  const result = await generateImage({ prompt, aspect: input.aspect ?? 'portrait', quality: input.fast ? 'fast' : 'best', timeoutMs: 18_000, skip: ['pollinations'], ...(input.fast ? {} : { prefer: 'photo' }) });
  if (!result.ok || result.attempts.length) console.warn('cover art:', result.ok ? 'ok via ' + result.provider : 'none', result.attempts.join(' | '));
  return result.ok ? { bytes: result.bytes, contentType: result.contentType } : null;
}
