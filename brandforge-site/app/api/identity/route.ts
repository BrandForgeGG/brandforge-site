import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import { getMyIdentity, getOnboardingState, updateMyProfile } from '@/lib/project-db';
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

    const onboarding = await getOnboardingState(user.id);

    return NextResponse.json({
      identity,
      telegram_connected: Boolean(identity.telegramChatId),
      onboarding_completed: onboarding.completed,
      marketing_opt_in: identity.marketingOptIn === true,
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
      marketing_opt_in?: unknown;
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
      // A picture is set through /api/profile/avatar. Here it can only be cleared, or point at our own storage.
      const own = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`;
      if (body.avatar_url !== null && !(typeof body.avatar_url === 'string' && process.env.NEXT_PUBLIC_SUPABASE_URL && body.avatar_url.startsWith(own))) {
        return NextResponse.json({ error: 'Use the photo button to change your picture.' }, { status: 400 });
      }
      updates.avatar_url = body.avatar_url ?? null;
    }

    // Product-update email consent — the same flag the email footer's
    // unsubscribe link flips, so Settings and the link stay in sync.
    if (body.marketing_opt_in !== undefined) {
      updates.marketing_opt_in = body.marketing_opt_in === true;
    }

    if (body.password !== undefined && typeof body.password === 'string' && body.password.length > 0) {
      const { error: pwdError } = await supabase.auth.updateUser({ password: body.password });
      if (pwdError) {
        return NextResponse.json({ error: pwdError.message }, { status: 400 });
      }
    }

    if (Object.keys(updates).length > 0) {
      const result = await updateMyProfile(user.id, updates as { display_name?: string; email?: string; avatar_url?: string | null; username?: string; marketing_opt_in?: boolean });
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