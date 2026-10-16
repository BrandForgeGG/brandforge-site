import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { makePostDraft } from '@/lib/post-draft';
import { TYPES, type PostType } from '@/lib/post-types.js';
import { checkRateLimit } from '@/lib/rate-limit';
import { withAiTier } from '@/lib/ai-tier';
import { withFreeGate } from '@/lib/usage-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { type, topic }: a first draft of an update, poll, quiz or thread. Signed-in only, rate limited.
async function handle(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in to write a post.' }, { status: 401 });
  const rate = checkRateLimit(`post-draft:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of drafts for one hour. Try again later.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { type?: unknown; topic?: unknown };
  const type = typeof body.type === 'string' && Object.prototype.hasOwnProperty.call(TYPES, body.type) ? (body.type as PostType) : null;
  if (!type) return NextResponse.json({ error: 'Pick a post type.' }, { status: 400 });
  const result = await makePostDraft(type, String(body.topic ?? ''));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ post: result.post });
}

// Runs in the asker's AI tier: paying accounts get the strongest models and a bigger daily allowance.
export async function POST(request: NextRequest) {
  return withFreeGate(request, 'creation', () => withAiTier(request, () => handle(request)));
}
