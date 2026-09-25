import { NextRequest, NextResponse } from 'next/server';
import { isStaffAccount, getPendingAiDrafts, resolveAiDraft } from '@/lib/project-db';
import { requireStaffContext } from '@/lib/staff';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get('conversationId') ?? '';
  const context = await requireStaffContext(conversationId, request);
  if (context instanceof NextResponse) return context;
  return NextResponse.json({ drafts: await getPendingAiDrafts(conversationId) });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const messageId = String(body.messageId ?? '').trim();
  const conversationId = String(body.conversationId ?? '').trim();
  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
  if (!messageId || !conversationId || !action) return NextResponse.json({ error: 'messageId, conversationId, and action are required' }, { status: 400 });
  const context = await requireStaffContext(conversationId, request);
  if (context instanceof NextResponse) return context;
  if (context.role === 'founder' || !(await isStaffAccount(context.user.id))) {
    return NextResponse.json({ error: 'Only BrandForge staff can resolve drafts' }, { status: 403 });
  }
  const result = await resolveAiDraft(messageId, context.user.id, context.displayName, action, conversationId);
  if (result === 'not_found') return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  return NextResponse.json({ success: true, result });
}
