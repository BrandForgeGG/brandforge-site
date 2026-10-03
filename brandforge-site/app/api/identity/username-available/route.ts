import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { isUsernameAvailable } from '@/lib/project-db';
import { validateUsername } from '@/lib/identity';
import { checkRateLimit } from '@/lib/rate-limit';

const CHECK_RATE_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 };

export const dynamic = 'force-dynamic';

// Availability probe for the onboarding username step: validate first (cheap,
// no I/O), then ask the database. Availability is an advisory read — the unique
// index still decides on save.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const rate = checkRateLimit(`username-check:${user.id}`, CHECK_RATE_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many checks — please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      );
    }

    const username = request.nextUrl.searchParams.get('username') ?? '';
    const validation = validateUsername(username);
    if (!validation.ok) {
      return NextResponse.json({ available: false, reason: validation.reason });
    }

    const available = await isUsernameAvailable(validation.username);
    return NextResponse.json({ available, username: validation.username });
  } catch (error) {
    console.error('Username availability error:', error);
    return NextResponse.json({ error: 'Could not check username' }, { status: 500 });
  }
}
