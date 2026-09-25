import { NextRequest, NextResponse } from 'next/server';
import { isStaffAccount, getPendingAiDrafts, resolveAiDraft } from '@/lib/project-db';
import { canResolveAiDraft } from '@/lib/money-authz.js';
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

  // Shared, unit-tested decision (lib/money-authz.js). `context.role === 'founder'` covers the
  // founder who happens to also hold a staff role: ownership is checked first, never bypassed.
  const decision = canResolveAiDraft({
    actor: { userId: context.user.id, isStaff: context.role !== 'founder' && (await isStaffAccount(context.user.id)) },
  });

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status });
  }
  const result = await resolveAiDraft(messageId, context.user.id, context.displayName, action, conversationId);
  if (result === 'not_found') return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  return NextResponse.json({ success: true, result });
}
