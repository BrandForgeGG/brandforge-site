import { NextRequest, NextResponse } from 'next/server';
import {
  announceReal,
  claimApplicationsForUser,
  createSpecialistApplication,
  getApplicationFor,
  getProfileRole,
  recordFunnelEvent,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { notify } from '@/lib/notify';
import { isValidEmail } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

const MAX_MESSAGE = 4000;
const SPECIALTIES = ['Design', 'Development', 'Video and motion', 'Marketing', 'Writing', 'Strategy', 'Other'];

// Open to everyone: an account is recommended (the status page and invitations need one) but never
// required. Per address, a handful of attempts an hour.
const APPLY_RATE_LIMIT = { limit: 3, windowMs: 60 * 60 * 1000 };

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

// POST /api/applications: apply to become a specialist, signed in or not.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const body = await request.json().catch(() => ({}));

    // Honeypot: humans never see this field; a filled value means a bot.
    if (typeof body.website === 'string' && body.website.trim().length > 0) {
      return NextResponse.json({ error: 'Submission rejected' }, { status: 400 });
    }

    const email = (user?.email ?? clean(body.email, 200)).toLowerCase();
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Enter an email address we can reach you on.' }, { status: 400 });
    }

    if (user) {
      const role = await getProfileRole(user.id);
      if (role === 'admin' || role === 'operator') {
        return NextResponse.json({ error: 'You already have specialist access' }, { status: 400 });
      }
    }

    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
    const rate = checkRateLimit(`apply:${user?.id ?? ip}`, APPLY_RATE_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      );
    }

    const message = clean(body.message, MAX_MESSAGE);
    if (message.length < 20) {
      return NextResponse.json({ error: 'Tell us a little more about how you work (at least a couple of sentences).' }, { status: 400 });
    }
    const specialty = SPECIALTIES.includes(String(body.specialty)) ? String(body.specialty) : '';
    if (!specialty) return NextResponse.json({ error: 'Pick what you do.' }, { status: 400 });

    const created = await createSpecialistApplication({
      userId: user?.id ?? null,
      email,
      fullName: clean(body.fullName, 120),
      specialty,
      links: clean(body.links, 1000),
      message,
    });
    if (!created.ok) {
      if (created.error === 'duplicate') {
        return NextResponse.json({ error: 'You already have an application in review.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Could not submit your application' }, { status: 500 });
    }

    await notify('application_submitted', { email });
    await recordFunnelEvent('apply_submitted', { signedIn: Boolean(user) });
    await announceReal('specialist_applied', {}, user ? [{ userId: user.id }] : []);

    return NextResponse.json({ application: { id: created.row.id, status: created.row.status, created_at: created.row.created_at } }, { status: 201 });
  } catch (error) {
    console.error('Application submit error:', error);
    return NextResponse.json({ error: 'Could not submit your application' }, { status: 500 });
  }
}

// GET: the signed-in person's application status. Also the moment an application made before
// registering gets linked to the new account.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    if (user.email) await claimApplicationsForUser(user.id, user.email);
    const application = await getApplicationFor(user.id, user.email ?? null);
    return NextResponse.json({
      application: application
        ? { id: application.id, status: application.status, message: application.message, created_at: application.created_at, reviewed_at: application.reviewed_at }
        : null,
    });
  } catch (error) {
    console.error('Application status error:', error);
    return NextResponse.json({ error: 'Failed to load application' }, { status: 500 });
  }
}
