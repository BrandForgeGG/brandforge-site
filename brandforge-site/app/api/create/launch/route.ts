import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { completeJson } from '@/lib/blueprint-llm';
import { writerChain } from '@/lib/llm-providers';
import { readSite, type SiteRead } from '@/lib/site-capture.js';
import { buildLaunchPrompt, launchText, normalizeLaunch } from '@/lib/launch-video.js';
import { screenText } from '@/lib/content-policy.js';
import { budgetLimits, decideBudget } from '@/lib/ai-budget.js';
import { getAiUsageToday } from '@/lib/project-db';
import { checkRateLimit } from '@/lib/rate-limit';
import { fetchSiteHtml, fetchStylesheets, pictureRoute } from '@/lib/launch-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIMIT = { limit: 8, windowMs: 60 * 60 * 1000 };
const MODELS = writerChain();

function siteUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// POST { url?, about? } -> { site, scenes }. Free, like the other makers: the page is read safely, a writer turns it into a
// launch story from the page's own facts, and the browser draws, voices and encodes the video. Pictures and the screenshot
// come back as addresses on our picture route, so the browser can put them in the video.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const rateKey = user ? `launch:u:${user.id}` : `launch:ip:${(request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'}`;
    if (!checkRateLimit(rateKey, LIMIT).allowed) return NextResponse.json({ error: 'That is a lot of launch videos for one hour. Try again in a little while.' }, { status: 429 });
    const apiKey = String(process.env.OPENROUTER_API_KEY ?? '').trim();
    if (!apiKey) return NextResponse.json({ error: 'The writer is not available right now.' }, { status: 503 });

    const body = (await request.json().catch(() => ({}))) as { url?: unknown; about?: unknown };
    const about = String(body.about ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    const rawUrl = String(body.url ?? '').trim();
    const url = siteUrl(rawUrl);
    if (rawUrl && !url) return NextResponse.json({ error: 'That does not look like a website address.' }, { status: 400 });
    if (!url && about.length < 12) return NextResponse.json({ error: 'Paste your website, or say what you are launching in a sentence or two.' }, { status: 400 });
    const screened = screenText(`${rawUrl}\n${about}`);
    if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });

    let site: SiteRead | null = null;
    if (url) {
      try {
        const page = await fetchSiteHtml(url);
        site = readSite(page.html, page.url, await fetchStylesheets(page.html, page.url));
      } catch (cause) {
        console.warn('[launch] site read failed:', cause instanceof Error ? cause.message : cause);
        if (about.length < 12) return NextResponse.json({ error: 'That site could not be read. Check the address, or describe the product instead.' }, { status: 422 });
      }
    }
    if (site && site.text.length < 80 && about.length < 12) {
      return NextResponse.json({ error: 'That page has almost no words to work from. Add a sentence about the product.' }, { status: 422 });
    }

    const usage = await getAiUsageToday(null).catch(() => ({ userToday: 0, aiToday: 0 }));
    const budget = decideBudget({ userToday: 0, aiToday: usage.aiToday }, budgetLimits(process.env));
    if (!budget.allowed) return NextResponse.json({ error: budget.message }, { status: 429 });

    const hasPictures = (site?.pictures.length ?? 0) >= 2;
    const prompt = buildLaunchPrompt({ site, about, hasPictures });
    const name = site?.name || '';
    let lastError = 'The writer is busy. Try again in a moment.';
    for (const model of MODELS) {
      try {
        // Fallback providers ("groq:" ...) and free models may think before answering, so they get room for both.
        const free = model.includes(':');
        const completion = await completeJson({ apiKey, model, system: prompt.system, user: prompt.user, temperature: 0.6, maxTokens: free ? 4000 : 1200, timeoutMs: free ? 45000 : 30000 });
        const checked = normalizeLaunch(completion.text, { name, hasSite: Boolean(site), hasPictures });
        if (!checked.ok) {
          console.warn('launch model answer refused:', model, checked.error, String(completion.text ?? '').slice(0, 300).replace(/\s+/g, ' '));
          lastError = checked.error;
          continue;
        }
        const words = screenText(launchText(checked.scenes));
        if (!words.ok) return NextResponse.json({ error: words.message }, { status: 422 });
        return NextResponse.json({
          site: site
            ? {
                name: site.name,
                host: site.host,
                url: site.url,
                colors: site.colors,
                shot: pictureRoute(site.url, 'shot'),
                pictures: site.pictures.map((picture) => ({ src: pictureRoute(picture.url), label: picture.label })),
              }
            : null,
          scenes: checked.scenes,
        });
      } catch (cause) {
        console.warn('launch model failed:', model, cause instanceof Error ? cause.message.slice(0, 160) : cause);
      }
    }
    return NextResponse.json({ error: `${lastError} Try again.` }, { status: 502 });
  } catch (error) {
    console.error('Launch video error:', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
