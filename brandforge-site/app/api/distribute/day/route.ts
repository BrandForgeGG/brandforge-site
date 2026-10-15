import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { writeDay, type DistributeBrief } from '@/lib/distribute-service';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';
import { withAiTier } from '@/lib/ai-tier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Step two: one day of a week. A week is seven of these (more when a day is asked for again), so the limit is generous.
const LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

function clientKey(request: NextRequest, userId: string | null): string {
  if (userId) return `distribute-day:u:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return `distribute-day:ip:${forwarded.split(',')[0].trim() || 'unknown'}`;
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// The brief comes back from the page, so it is rebuilt from scratch here with every field clamped: nothing the page sends
// is trusted to be the shape or the size it was when the server made it.
function readBrief(value: unknown): DistributeBrief | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const angles = (Array.isArray(raw.angles) ? raw.angles : []).map((angle) => text(angle, 120)).filter(Boolean).slice(0, 40);
  const summary = text(raw.summary, 450);
  const start = typeof raw.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.start) ? raw.start : '';
  const perDay = Math.round(Number(raw.perDay));
  if (!summary || angles.length < 3 || !start || !(perDay >= 1 && perDay <= 5)) return null;
  const source = raw.source === 'link' || raw.source === 'file' ? raw.source : 'text';
  return { start, perDay, summary, voice: text(raw.voice, 170), angles, site: text(raw.site, 120), brand: text(raw.brand, 60), seed: text(raw.seed, 80) || start, source };
}

// POST { brief, dayIndex } -> { day }
async function handle(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const rate = checkRateLimit(clientKey(request, user?.id ?? null), LIMIT);
    if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of days for one hour. Try again in a little while.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const brief = readBrief(body.brief);
    const dayIndex = Number(body.dayIndex);
    if (!brief || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return NextResponse.json({ error: 'That day could not be read. Write the week again.' }, { status: 400 });
    const screened = screenText(`${brief.summary}\n${brief.angles.join('\n')}`);
    if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });
    return NextResponse.json({ day: await writeDay(brief, dayIndex) });
  } catch (error) {
    console.error('Distribute day error:', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}

// Runs in the asker's AI tier: paying accounts get the strongest models and a bigger daily allowance.
export async function POST(request: NextRequest) {
  return withAiTier(request, () => handle(request));
}
