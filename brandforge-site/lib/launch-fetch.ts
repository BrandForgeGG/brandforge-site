import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertSafeUrl } from '@/lib/research.js';

// Fetching for launch videos, server side. Every address (and every redirect) is checked as a public one first, answers
// are size-capped and time-boxed, and pictures are only passed through when this server signed their address, so the
// picture route cannot be used as an open proxy.

const MAX_HTML = 2_500_000;
const MAX_IMAGE = 6_000_000;

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      throw new Error('too_large');
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

async function safeGet(raw: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<Response> {
  let current = (await assertSafeUrl(raw)) as URL;
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current.href, { redirect: 'manual', signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrandForgeBot/1.0; +https://brandforge.gg)', ...headers } });
    const location = res.headers.get('location');
    if (![301, 302, 303, 307, 308].includes(res.status) || !location) return res;
    current = (await assertSafeUrl(new URL(location, current.href).href)) as URL;
  }
  throw new Error('too_many_redirects');
}

/** A web page's HTML and its final address. Throws on anything that is not a public HTML page. */
export async function fetchSiteHtml(raw: string): Promise<{ html: string; url: string }> {
  const res = await safeGet(raw, 9000, { Accept: 'text/html,application/xhtml+xml' });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const type = (res.headers.get('content-type') ?? '').toLowerCase();
  if (type && !type.includes('html')) throw new Error('not_html');
  const bytes = await readCapped(res, MAX_HTML);
  return { html: new TextDecoder().decode(bytes), url: res.url || raw };
}

/** The page's first stylesheets as text (where most sites keep their brand colours). Never throws. */
export async function fetchStylesheets(html: string, base: string, max = 2): Promise<string> {
  const hrefs: string[] = [];
  for (const m of html.matchAll(/<link\s[^>]*>/gi)) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(m[0])) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1];
    if (!href) continue;
    try {
      hrefs.push(new URL(href.replace(/&amp;/g, '&'), base).href);
    } catch {
      /* not an address */
    }
    if (hrefs.length >= max) break;
  }
  const sheets = await Promise.all(
    hrefs.map(async (href) => {
      try {
        const res = await safeGet(href, 5000, { Accept: 'text/css' });
        if (!res.ok) return '';
        return new TextDecoder().decode(await readCapped(res, 800_000));
      } catch {
        return '';
      }
    })
  );
  return sheets.filter(Boolean).join('\n');
}

/** A picture's bytes and type. Throws on anything that is not a public image. */
export async function fetchImage(raw: string, timeoutMs = 12000): Promise<{ bytes: Uint8Array; type: string }> {
  const res = await safeGet(raw, timeoutMs, { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(type)) throw new Error('not_image');
  return { bytes: await readCapped(res, MAX_IMAGE), type };
}

/** A full-page screenshot of a public site from a free screenshot service (no key). Tall, so the tour can scroll it. */
export function screenshotSources(site: string): string[] {
  return [
    `https://image.thum.io/get/width/1280/crop/2400/noanimate/${site}`,
    `https://image.thum.io/get/width/1280/crop/2400/${site}`,
  ];
}

function key(): string {
  return `launch-picture:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.CRON_SECRET ?? 'brandforge'}`;
}

/** A signature for a picture address this server chose (a site picture or a screenshot). */
export function signPicture(url: string): string {
  return createHmac('sha256', key()).update(url).digest('base64url').slice(0, 32);
}

export function checkPicture(url: string, sig: string): boolean {
  const expected = Buffer.from(signPicture(url));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The address the browser loads a picture from: our picture route, so the canvas stays exportable. */
export function pictureRoute(url: string, kind: 'img' | 'shot' = 'img'): string {
  return `/api/create/launch/picture?kind=${kind}&u=${encodeURIComponent(url)}&s=${signPicture(url)}`;
}
