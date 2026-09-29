import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import { getMyIdentity, updateMyProfile } from '@/lib/project-db';
import { validateUsername } from '@/lib/identity';
import { checkRateLimit } from '@/lib/rate-limit';

const IDENTITY_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

export const dynamic = 'force-dynamic';

// The signed-in member's own identity row: public number, handle, role, and Telegram link state.
// This is the only route that returns a member's own email, so it is scoped strictly to the
// caller and never accepts a user id from the request.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const identity = await getMyIdentity(user.id);

    if (!identity) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      identity,
      telegram_connected: Boolean(identity.telegramChatId),
    });
  } catch (error) {
    console.error('Identity API error:', error);
    return NextResponse.json({ error: 'Failed to load identity' }, { status: 500 });
  }
}

// Updates the caller's own profile fields: username, display_name, email, avatar_url, password.
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const rate = checkRateLimit(`identity:${user.id}`, IDENTITY_RATE_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many profile updates — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      username?: unknown;
      display_name?: unknown;
      email?: unknown;
      avatar_url?: unknown;
      password?: unknown;
    };

    const updates: Record<string, unknown> = {};

    if (body.username !== undefined) {
      const validation = validateUsername(body.username);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.reason }, { status: 400 });
      }
      updates.username = validation.username;
    }

    if (body.display_name !== undefined && typeof body.display_name === 'string') {
      updates.display_name = body.display_name.trim() || null;
    }

    if (body.email !== undefined && typeof body.email === 'string') {
      updates.email = body.email.trim() || null;
    }

    if (body.avatar_url !== undefined) {
      updates.avatar_url = body.avatar_url ?? null;
    }

    if (body.password !== undefined && typeof body.password === 'string' && body.password.length > 0) {
      const { error: pwdError } = await supabase.auth.updateUser({ password: body.password });
      if (pwdError) {
        return NextResponse.json({ error: pwdError.message }, { status: 400 });
      }
    }

    if (Object.keys(updates).length > 0) {
      const result = await updateMyProfile(user.id, updates as { display_name?: string; email?: string; avatar_url?: string | null; username?: string });
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: 400 });
      }
      return NextResponse.json({ identity: result.identity });
    }

    return NextResponse.json({ identity: await getMyIdentity(user.id) });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}