import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { addMessage, addParticipant, decideOperatorApplication, isAdminAccount, recordFunnelEvent } from '@/lib/project-db';
import { getActorName, getAuthenticatedUser } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email';
import { resolveSiteUrl } from '@/lib/auth-utils';
import { buildSpecialistEmail } from '@/lib/specialist-emails.js';

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
      const decided = await decideOperatorApplication(applicationId, user.id, 'accept');
      if (!decided.ok) {
        return NextResponse.json(
          { error: decided.error === 'already_reviewed' ? 'That application was already reviewed.' : decided.error === 'not_found' ? 'Application not found.' : 'Could not accept the application. Try again.' },
          { status: decided.error === 'failed' ? 500 : 409 }
        );
      }

      // A real approval, recorded server-side. Declines are intentionally not an event: the brief asks
      // for application_approved, and counting declines would turn a conversion metric into something
      // that rewards rejecting people.
      await recordFunnelEvent('application_approved', { signedIn: true });

      // Tell the specialist they are in. Email is best-effort and never fails the approval itself.
      try {
        const to = String(decided.email ?? '').trim();
        if (to) {
          const site = resolveSiteUrl();
          const built = buildSpecialistEmail('accepted', {
            inboxUrl: `${site}/chat`,
            vettingUrl: `${site}/specialists`,
            profileUrl: `${site}/specialists/me`,
          });
          if (built) await sendEmail({ to, subject: built.subject, text: built.text, html: built.html });
        }
      } catch {
        // Best-effort: the approval stands regardless.
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'decline') {
      const decided = await decideOperatorApplication(applicationId, user.id, 'decline');
      if (!decided.ok) {
        return NextResponse.json(
          { error: decided.error === 'already_reviewed' ? 'That application was already reviewed.' : decided.error === 'not_found' ? 'Application not found.' : 'Could not decline the application. Try again.' },
          { status: decided.error === 'failed' ? 500 : 409 }
        );
      }
      return NextResponse.json({ success: true });
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
