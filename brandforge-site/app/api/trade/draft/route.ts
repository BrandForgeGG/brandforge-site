import { NextRequest, NextResponse } from 'next/server';
import { completeJson } from '@/lib/blueprint-llm';
import { writerChain } from '@/lib/llm-providers';
import { CATEGORIES, guessListing, validateListing } from '@/lib/trade.js';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODELS = writerChain();
const LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

const SYSTEM = `You turn what a person typed into a clear Trade listing for a marketplace of services, products, tools, startups and requests.
Return ONLY JSON: {"kind":"offer"|"request","category":string,"title":string,"description":string,"currency":"EUR"|"USD"|"GBP","budgetMin":number|null,"budgetMax":number|null}.
Rules:
- kind is "offer" when the person offers or sells something (a service, gig, profile, product, tool, startup launch); "request" when they need something or someone.
- category is exactly one of: ${CATEGORIES.join(' | ')}.
- title: plain, specific, at most 80 characters, no hype words.
- description: two or three plain sentences using ONLY what the person said. Do not invent skills, clients, results or guarantees.
- Prices: use a number only if the person stated one; otherwise null. Never invent a price.
- Same language as the input.`;

// POST { text }: describe it in your own words and get a ready listing back to check and publish. If the writer
// is unavailable a plain first draft is made from the same words, so this never dead-ends.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
  const rate = checkRateLimit(`trade-draft:${user?.id ?? ip}`, LIMIT);
  if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of drafts. Try again in a little while.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 1200) : '';
  if (text.length < 12) return NextResponse.json({ error: 'Say a little more about it, one or two sentences.' }, { status: 400 });
  const screened = screenText(text);
  if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });

  const apiKey = process.env.OPENROUTER_API_KEY || '';
  for (const model of MODELS) {
    try {
      const completion = await completeJson({ apiKey, model, system: SYSTEM, user: text, temperature: 0.3, maxTokens: model.endsWith(':free') ? 2500 : 500, timeoutMs: model.endsWith(':free') ? 40000 : 20000 });
      const json = JSON.parse(completion.text.slice(completion.text.indexOf('{'), completion.text.lastIndexOf('}') + 1));
      const checked = validateListing({ ...json, budgetMin: json.budgetMin ?? '', budgetMax: json.budgetMax ?? '' });
      if (checked.ok) return NextResponse.json({ draft: toDraft(checked.value), source: 'ai' });
    } catch {
      // try the next writer
    }
  }
  const basic = guessListing(text);
  const checked = validateListing(basic);
  return NextResponse.json({ draft: checked.ok ? toDraft(checked.value) : { ...basic, budgetMin: basic.budgetMin ?? '', budgetMax: basic.budgetMax ?? '' }, source: 'basic' });
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
