import { NextRequest, NextResponse } from 'next/server';
import { inviteSpecialistByEmail, isAdminAccount, recordFunnelEvent } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email';
import { resolveSiteUrl } from '@/lib/auth-utils';
import { buildSpecialistEmail } from '@/lib/specialist-emails.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/;

// POST /api/admin/invitations: invite a specialist by email from the dashboard.
// body: { email, name?, specialty?, note? }. Admin only.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!(await isAdminAccount(user.id))) return NextResponse.json({ error: 'Admin access only' }, { status: 403 });

    const rate = checkRateLimit(`invite-specialist:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) return NextResponse.json({ error: 'Too many invitations this hour.' }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
    if (!EMAIL.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    const name = String(body.name ?? '').trim().slice(0, 80);
    const specialty = String(body.specialty ?? '').trim().slice(0, 120);
    const note = String(body.note ?? '').trim().slice(0, 300);

    const result = await inviteSpecialistByEmail({ email, name, specialty, note, invitedBy: user.id });
    if (!result.ok) {
      if (result.error === 'is_admin') return NextResponse.json({ error: 'That address belongs to an admin already.' }, { status: 409 });
      return NextResponse.json({ error: 'Could not save the invitation.' }, { status: 500 });
    }

    const site = resolveSiteUrl();
    const built = buildSpecialistEmail(result.existingAccount ? 'accepted' : 'invited', {
      name,
      inviteNote: note,
      signInUrl: `${site}/login`,
      inboxUrl: `${site}/chat`,
      vettingUrl: `${site}/specialists`,
      profileUrl: `${site}/specialists/me`,
    });
    let emailed = false;
    if (built) {
      const sent = await sendEmail({ to: email, subject: built.subject, text: built.text, html: built.html }).catch(() => ({ ok: false }));
      emailed = Boolean((sent as { ok?: boolean }).ok);
    }
    await recordFunnelEvent('specialist_invited', { signedIn: true, source: 'organic' }).catch(() => undefined);
    return NextResponse.json({ success: true, existingAccount: result.existingAccount, emailed });
  } catch (error) {
    console.error('Invite specialist error:', error);
    return NextResponse.json({ error: 'Could not send the invitation.' }, { status: 500 });
  }
}
