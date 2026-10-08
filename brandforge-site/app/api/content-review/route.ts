import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { postOpsEvent } from '@/lib/ops-events';
import { CATEGORIES } from '@/lib/content-policy.js';

export const dynamic = 'force-dynamic';

const LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

// A person asks staff to look again at something the sector filter declined. Works for guests
// too (rate-limited by address); staff answer in the chat, nothing is changed automatically.
export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
    const rate = checkRateLimit(`content-review:${ip}`, LIMIT);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const text = String(body.text ?? '').trim().slice(0, 500);
    const note = String(body.note ?? '').trim().slice(0, 300);
    const category = CATEGORIES.some((item: { id: string }) => item.id === body.category) ? String(body.category) : 'unsupported';
    const conversationId = typeof body.conversationId === 'string' && body.conversationId.length <= 64 ? body.conversationId : undefined;
    if (text.length < 3) return NextResponse.json({ error: 'Nothing to review.' }, { status: 400 });

    await postOpsEvent('content_review', { text, note, category, conversationId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Content review error:', error);
    return NextResponse.json({ error: 'Could not send the request' }, { status: 500 });
  }
}
