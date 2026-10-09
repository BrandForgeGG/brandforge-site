import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { deleteCarousel, listCarousels, saveCarousel } from '@/lib/project-db';
import { sanitizeDraft } from '@/lib/carousel-draft.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

async function requireUser(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: 'Sign in to save carousels.' }, { status: 401 }) } as const;
  return { user } as const;
}

// GET: your saved carousels, newest first.
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;
  return NextResponse.json({ carousels: await listCarousels(auth.user.id) });
}

// POST: save a carousel (new, or update with `id`). The plan is re-validated and clamped; logos and
// pictures are never stored.
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;
  const rate = checkRateLimit(`carousel-save:${auth.user.id}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many saves. Try again later.' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = sanitizeDraft(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  const saved = await saveCarousel(auth.user.id, id, checked.draft);
  if (!saved.ok) {
    if (saved.error === 'not_found') return NextResponse.json({ error: 'That carousel no longer exists.' }, { status: 404 });
    if (saved.error === 'limit') return NextResponse.json({ error: 'You have 100 saved carousels. Delete one to save another.' }, { status: 409 });
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  }
  return NextResponse.json({ carousel: saved.row });
}

// DELETE ?id=: remove one of your carousels.
export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Unknown carousel.' }, { status: 400 });
  return NextResponse.json({ success: await deleteCarousel(auth.user.id, id) });
}
