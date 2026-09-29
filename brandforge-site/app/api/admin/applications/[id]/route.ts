import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { addMessage, addParticipant, isAdminAccount, recordFunnelEvent } from '@/lib/project-db';
import { getActorName, getAuthenticatedUser } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email';
import { resolveSiteUrl } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  }

  if (!(await isAdminAccount(user.id))) {
    return { error: NextResponse.json({ error: 'Admin access only' }, { status: 403 }) };
  }

  return { user };
}

// POST /api/admin/applications/[id]
// body.action: 'accept' | 'decline' | 'invite'
// invite additionally requires body.conversationId.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAdmin(request);

    if (error) {
      return error;
    }

    const { id: applicationId } = await params;

    if (!applicationId?.trim()) {
      return NextResponse.json({ error: 'Application id is required' }, { status: 400 });
    }

    let body: { action?: unknown; conversationId?: unknown } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const action = String(body.action ?? '');

    if (action === 'accept') {
      const supabase = await createSupabaseServerClient(request);
      const { data, error: rpcError } = await supabase.rpc('accept_operator_application', {
        application_id: applicationId,
      });

      if (rpcError) {
        console.error('Accept application error:', rpcError.message);
        return NextResponse.json(
          { error: rpcError.message || 'Could not accept application' },
          { status: 400 }
        );
      }

      // A real approval, recorded server-side. Declines are intentionally not an event: the brief asks
      // for application_approved, and counting declines would turn a conversion metric into something
      // that rewards rejecting people.
      await recordFunnelEvent('application_approved', { signedIn: true });

      // Acceptance was silent: nothing told the specialist they are in. Tell them now —
      // email is best-effort and never fails the approval itself.
      try {
        const { data: approved } = await supabase
          .from('operator_applications')
          .select('email')
          .eq('id', applicationId)
          .maybeSingle();
        const to = String(
          (approved as { email?: string | null } | null)?.email ?? ''
        ).trim();
        if (to) {
          const inboxUrl = `${resolveSiteUrl()}/chat`;
          await sendEmail({
            to,
            subject: 'You are in — BrandForge specialist',
            text: `Your application was accepted. Open your staff inbox and watch for new briefs — each one you open is yours to propose on.\n\n${inboxUrl}\n\nLink Telegram from the sidebar to get pinged the moment a brief lands.`,
            html: `<p>Your application was accepted.</p><p>Open your <a href="${inboxUrl}">staff inbox</a> and watch for new briefs — each one you open is yours to propose on.</p><p>Link Telegram from the sidebar to get pinged the moment a brief lands.</p>`,
          });
        }
      } catch {
        // Best-effort: the approval stands regardless.
      }

      return NextResponse.json({ success: true, application: data });
    }

    if (action === 'decline') {
      const supabase = await createSupabaseServerClient(request);
      const { data, error: updateError } = await supabase
        .from('operator_applications')
        .update({
          status: 'declined',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', applicationId)
        .eq('status', 'pending')
        .select('id, status')
        .maybeSingle();

      if (updateError) {
        console.error('Decline application error:', updateError.message);
        return NextResponse.json({ error: 'Could not decline application' }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json(
          { error: 'Application not found or already reviewed' },
          { status: 409 }
        );
      }

      return NextResponse.json({ success: true, application: data });
    }

    if (action === 'invite') {
      const conversationId = String(body.conversationId ?? '').trim();

      if (!conversationId) {
        return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
      }

      const supabase = await createSupabaseServerClient(request);
      const { data: application, error: appError } = await supabase
        .from('operator_applications')
        .select('id, user_id, email, status')
        .eq('id', applicationId)
        .maybeSingle();

      if (appError || !application) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
      }

      if (application.status !== 'accepted') {
        return NextResponse.json(
          { error: 'Accept the application before inviting to a chat' },
          { status: 400 }
        );
      }

      const { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .maybeSingle();

      if (!conversation) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }

      const displayName =
        String(application.email ?? '').split('@')[0] || 'BrandForge Specialist';

      const participant = await addParticipant({
        conversation_id: conversationId,
        user_id: application.user_id,
        role: 'operator',
        display_name: displayName,
      });

      if (!participant) {
        return NextResponse.json({ error: 'Could not add participant' }, { status: 500 });
      }

      const adminName = getActorName(user);
      await addMessage({
        conversation_id: conversationId,
        sender_type: 'ai',
        sender_name: 'BrandForge',
        content: `${displayName} joined this conversation (${adminName} invited them).`,
        content_type: 'system',
      });

      return NextResponse.json({ success: true, conversationId, userId: application.user_id });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Admin application action error:', error);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
