import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { canAccessConversation, getConversation } from '@/lib/project-db';
import { isValidEmail, resolveSiteUrl } from '@/lib/auth-utils';
import { escapeHtml, oneLine } from '@/lib/html';
import { notify } from '@/lib/notify';
import { sendEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Each invite sends a real email on the founder's Resend quota, so invites are
// throttled per sender (per instance — see lib/rate-limit.js).
const INVITE_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      conversationId?: unknown;
      email?: unknown;
    };

    if (!body.conversationId || !body.email) {
      return NextResponse.json({ error: 'conversationId and email are required' }, { status: 400 });
    }

    if (typeof body.conversationId !== 'string' || typeof body.email !== 'string') {
      return NextResponse.json({ error: 'conversationId and email must be strings' }, { status: 400 });
    }

    if (!isValidEmail(body.email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    const rate = checkRateLimit(`invite:${user.id}`, INVITE_RATE_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many invites — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      );
    }

    const access = await canAccessConversation(user.id, body.conversationId);
    if (!access) {
      return NextResponse.json({ error: 'You do not have access to this conversation' }, { status: 403 });
    }

    const conversation = await getConversation(body.conversationId);
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Signature is notify(event, details) — an object here would be an unknown event
    // and silently no-op, so the team never hears about invites.
    await notify('invite_sent', {
      email: body.email.trim(),
      conversationId: body.conversationId,
      invitedBy: user.email ?? user.id,
    });

    // The actual invite email. Non-fatal: the invite itself is recorded either way,
    // and a provider hiccup must never turn into a 500 for the sender.
    const siteUrl = resolveSiteUrl();
    const chatUrl = `${siteUrl}/chat?conversationId=${encodeURIComponent(body.conversationId)}`;
    // Display name comes from Google metadata and the title from the founder — both are
    // user-controlled, so they are escaped for the HTML body and flattened for the subject.
    const inviterName = oneLine(
      (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        user.email ||
        'A BrandForge member',
      80,
    );
    const conversationTitle = oneLine(
      (conversation as { title?: string | null }).title || 'a project',
      80,
    );
    const safeInviterName = escapeHtml(inviterName);
    const safeConversationTitle = escapeHtml(conversationTitle);

    const emailResult = await sendEmail({
      to: body.email.trim(),
      subject: `${inviterName} invited you to ${conversationTitle}`,
      text: `${inviterName} invited you to collaborate on ${conversationTitle} on BrandForge.\n\nOpen the chat: ${chatUrl}\n\nIf you don't have an account yet, signing in with Google will create one for this address.`,
      html: `
        <div style="background:#14171a;padding:32px;font-family:Georgia,serif">
          <div style="max-width:520px;margin:0 auto;background:#1c2024;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px">
            <p style="color:#e8571e;text-transform:uppercase;letter-spacing:0.18em;font-size:11px;margin:0 0 16px">BrandForge</p>
            <h1 style="font-size:20px;color:#ece7de;margin:0 0 12px;font-weight:600">You have been invited to a project chat</h1>
            <p style="font-family:Arial,sans-serif;font-size:14px;color:#9aa0a6;line-height:1.6;margin:0 0 20px">
              <strong style="color:#ece7de">${safeInviterName}</strong> invited you to collaborate on
              <strong style="color:#ece7de">${safeConversationTitle}</strong>. Open the chat to see the
              brief, the proposal and the task board.
            </p>
            <a href="${escapeHtml(chatUrl)}" style="display:inline-block;background:#e8571e;color:#14171a;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:8px;text-decoration:none">Open the chat</a>
            <p style="font-family:Arial,sans-serif;font-size:12px;color:#8f959b;margin:20px 0 0">
              No account yet? Signing in with Google creates one for this address.
            </p>
          </div>
        </div>`,
    });

    if (!emailResult.ok && !emailResult.skipped) {
      // Log the reason, never the recipient or key.
      console.warn('Invite email failed:', emailResult.error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Invite error:', error);
    return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 });
  }
}
