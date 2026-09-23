import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProfileRole } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_MESSAGE = 4000;

// H8: a signed-in account may only submit a handful of applications per hour
// (per instance — see lib/rate-limit.js for the serverless caveat).
const APPLY_RATE_LIMIT = { limit: 3, windowMs: 60 * 60 * 1000 };

// POST /api/applications — submit a specialist application (own row only, via RLS).
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const role = await getProfileRole(user.id);

    if (role === 'admin' || role === 'operator') {
      return NextResponse.json({ error: 'You already have staff access' }, { status: 400 });
    }

    const rate = checkRateLimit(`apply:${user.id}`, APPLY_RATE_LIMIT);

    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many submissions — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      );
    }

    let body: { message?: unknown; website?: unknown } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    // Honeypot: the form renders a `website` field humans never see or fill.
    // A filled value means a bot — reject before anything touches the database.
    if (typeof body.website === 'string' && body.website.trim().length > 0) {
      return NextResponse.json({ error: 'Submission rejected' }, { status: 400 });
    }

    const message = String(body.message ?? '').trim();

    if (!message) {
      return NextResponse.json({ error: 'Tell us a bit about how you work' }, { status: 400 });
    }

    if (message.length > MAX_MESSAGE) {
      return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient(request);
    const { data, error } = await supabase
      .from('operator_applications')
      .insert({
        user_id: user.id,
        email: user.email,
        message,
        status: 'pending',
      })
      .select('id, status, created_at')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'You already have an application in review' },
          { status: 409 }
        );
      }
      console.error('Application submit error:', error.message);
      return NextResponse.json({ error: 'Could not submit application' }, { status: 500 });
    }

    return NextResponse.json({ application: data }, { status: 201 });
  } catch (error) {
    console.error('Application submit error:', error);
    return NextResponse.json({ error: 'Could not submit application' }, { status: 500 });
  }
}

// GET /api/applications — the signed-in user's own application status.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient(request);
    const { data, error } = await supabase
      .from('operator_applications')
      .select('id, status, message, created_at, reviewed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Application status error:', error.message);
      return NextResponse.json({ error: 'Failed to load application' }, { status: 500 });
    }

    return NextResponse.json({ application: data?.[0] ?? null });
  } catch (error) {
    console.error('Application status error:', error);
    return NextResponse.json({ error: 'Failed to load application' }, { status: 500 });
  }
}
