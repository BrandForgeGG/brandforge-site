import { NextRequest, NextResponse } from 'next/server';
import { getPendingAiDrafts, resolveAiDraft } from '@/lib/project-db';
import { getActorName, getAuthenticatedUser } from '@/lib/supabase-server';
import { requireStaffContext } from '@/lib/staff';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get('conversationId') ?? '';
  const context = await requireStaffContext(conversationId, request);
  if (context instanceof NextResponse) return context;
  return NextResponse.json({ drafts: await getPendingAiDrafts(conversationId) });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const messageId = String(body.messageId ?? '').trim();
  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
  if (!messageId || !action) return NextResponse.json({ error: 'messageId and action are required' }, { status: 400 });
  const result = await resolveAiDraft(messageId, user.id, getActorName(user), action);
  if (result === 'not_found') return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  return NextResponse.json({ success: true, result });
}
