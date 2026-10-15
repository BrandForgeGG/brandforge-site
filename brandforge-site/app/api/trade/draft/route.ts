import { NextRequest, NextResponse } from 'next/server';
import { completeJson } from '@/lib/blueprint-llm';
import { guessListing, validateListing } from '@/lib/trade.js';
import { buildListingPrompt, extractUrls, isRichDescription, normalizeNotes } from '@/lib/trade-research.js';
import { fetchPage, searchWeb } from '@/lib/research';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { aiModels } from '@/lib/ai-tier';
import { noteFailure } from '@/lib/model-router.js';
import { withAiTier } from '@/lib/ai-tier';
import { withCraft } from '@/lib/craft.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

type Source = { url: string; title: string; ok: boolean };

// POST { text }: describe it in your own words (or point at a page) and get a ready listing back to check and
// publish. A link is read first, and the listing is written from what the page says, with a short note of what was
// found and what would make it stronger. If the writer is unavailable a plain first draft is made from the same
// words, so this never dead-ends.
async function handle(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
  const rate = checkRateLimit(`trade-draft:${user?.id ?? ip}`, LIMIT);
  if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of drafts. Try again in a little while.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 1200) : '';
  if (text.length < 12) return NextResponse.json({ error: 'Say a little more about it, one or two sentences.' }, { status: 400 });
  const screened = screenText(text);
  if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });

  // 1. Read what the person pointed at (the fetcher refuses private and internal addresses).
  const sources: Source[] = [];
  const pages: { url: string; title: string; text: string }[] = [];
  const reads = await Promise.all(
    extractUrls(text, 2).map(async (url) => {
      try {
        const page = await fetchPage(url, { timeoutMs: 8000, maxChars: 6000 });
        return { url, page };
      } catch {
        return { url, page: null };
      }
    }),
  );
  for (const { url, page } of reads) {
    if (page && page.text.trim().length >= 80) {
      pages.push({ url: page.url, title: page.title, text: page.text });
      sources.push({ url: page.url, title: page.title || new URL(page.url).hostname, ok: true });
    } else {
      sources.push({ url, title: new URL(url).hostname, ok: false });
    }
  }
  const pageScreen = screenText(pages.map((page) => `${page.title}\n${page.text.slice(0, 2000)}`).join('\n'));
  if (!pageScreen.ok) return NextResponse.json({ error: 'That page is not something Trade can list.' }, { status: 422 });

  // 2. A little public context about the same business, when web search is switched on. Never required.
  const snippets: { title: string; snippet?: string; url?: string }[] = [];
  const searchKey = process.env.SEARCH_API_KEY || '';
  const provider = process.env.SEARCH_PROVIDER || 'serper';
  if (pages.length && (searchKey || provider === 'ddg')) {
    try {
      const host = new URL(pages[0].url).hostname.replace(/^www\./, '');
      const found = await searchWeb({ query: host, num: 3, provider, apiKey: searchKey, timeoutMs: 5000 });
      for (const result of found.results.slice(0, 3)) {
        if (!result.url.includes(host)) snippets.push({ title: result.title, snippet: result.snippet, url: result.url });
      }
    } catch {
      /* the page alone is enough */
    }
  }

  // 3. Write it.
  const prompt = buildListingPrompt({ text, pages, snippets });
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  let thin: { draft: ReturnType<typeof toDraft>; notes: { found: string[]; tips: string[] } } | null = null;
  for (const model of aiModels()) {
    try {
      const completion = await completeJson({ apiKey, model, system: withCraft(prompt.system), user: prompt.user, temperature: 0.5, maxTokens: model.includes(':') ? 3000 : 1100, timeoutMs: model.includes(':') ? 45000 : 25000 });
      const json = JSON.parse(completion.text.slice(completion.text.indexOf('{'), completion.text.lastIndexOf('}') + 1));
      const checked = validateListing({ ...json, budgetMin: json.budgetMin ?? '', budgetMax: json.budgetMax ?? '' });
      if (!checked.ok) continue;
      const result = { draft: toDraft(checked.value), notes: normalizeNotes(json) };
      // A listing without a hook and a list is not what this is for: try the next writer, keep this as a fallback.
      if (!isRichDescription(checked.value.description)) {
        thin = thin ?? result;
        continue;
      }
      return NextResponse.json({ draft: result.draft, source: 'ai', research: { sources, ...result.notes } });
    } catch {
      noteFailure(model);
      // try the next writer
    }
  }
  if (thin) return NextResponse.json({ draft: thin.draft, source: 'ai', research: { sources, ...thin.notes } });

  const basic = guessListing(text);
  const checked = validateListing(basic);
  return NextResponse.json({ draft: checked.ok ? toDraft(checked.value) : { ...basic, budgetMin: basic.budgetMin ?? '', budgetMax: basic.budgetMax ?? '' }, source: 'basic', research: { sources, found: [], tips: [] } });
}

function toDraft(value: { kind: string; category: string; title: string; description: string; currency: string; budgetMinCents: number | null; budgetMaxCents: number | null }) {
  return {
    kind: value.kind,
    category: value.category,
    title: value.title,
    description: value.description,
    currency: value.currency,
    budgetMin: value.budgetMinCents == null ? '' : String(value.budgetMinCents / 100),
    budgetMax: value.budgetMaxCents == null ? '' : String(value.budgetMaxCents / 100),
  };
}

// Runs in the asker's AI tier: paying accounts get the strongest models and a bigger daily allowance.
export async function POST(request: NextRequest) {
  return withAiTier(request, () => handle(request));
}
