import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { canAccessConversation, decideAiAccess, getAiAccess, listPendingAiAccess, requestAiAccess } from '@/lib/project-db';
import { accessState } from '@/lib/ai-access.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

async function guard(request: NextRequest, params: Promise<{ id: string }>) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: 'Sign in first' }, { status: 401 }) } as const;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: NextResponse.json({ error: 'Invalid chat' }, { status: 400 }) } as const;
  if (!(await canAccessConversation(user.id, id, { allowStaff: true }))) return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) } as const;
  return { user, id } as const;
}

// GET: can I make the AI generate here, and (for the owner) who is asking.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const checked = await guard(request, params);
  if ('error' in checked) return checked.error;
  const who = await getAiAccess(checked.id, checked.user.id);
  return NextResponse.json({
    isOwner: who.isOwner,
    state: accessState(who),
    pending: who.isOwner ? await listPendingAiAccess(checked.id) : [],
  });
}

// POST { action: 'request' }: ask the chat owner to let me use the AI.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const checked = await guard(request, params);
  if ('error' in checked) return checked.error;
  const rate = checkRateLimit(`ai-access:${checked.user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  const result = await requestAiAccess(checked.id, checked.user.id);
  if (!result.ok) return NextResponse.json({ error: 'Could not send the request. Try again.' }, { status: 500 });
  return NextResponse.json({ state: result.status === 'granted' ? 'allowed' : 'requested' });
}

// PATCH { userId, decision: 'grant' | 'deny' | 'revoke' }: the chat owner decides.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const checked = await guard(request, params);
  if ('error' in checked) return checked.error;
  const body = (await request.json().catch(() => ({}))) as { userId?: unknown; decision?: unknown };
  const target = typeof body.userId === 'string' && /^[0-9a-f-]{36}$/i.test(body.userId) ? body.userId : null;
  const decision = body.decision === 'grant' || body.decision === 'deny' || body.decision === 'revoke' ? body.decision : null;
  if (!target || !decision) return NextResponse.json({ error: 'Pick a person and a decision.' }, { status: 400 });
  const ok = await decideAiAccess(checked.id, checked.user.id, target, decision);
  if (!ok) return NextResponse.json({ error: 'Only the chat owner can decide.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
