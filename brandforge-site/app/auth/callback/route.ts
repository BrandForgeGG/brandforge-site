import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sanitizeNextPath } from '@/lib/auth-utils';
import { countRegisteredProfiles, mergeBlueprintSessionToUser, recordFunnelEvent } from '@/lib/project-db';
import { verifySessionToken } from '@/lib/blueprint-session';
import { isFreshSignup, postRegistrationNotice } from '@/lib/registration-notice';
import { postPublicActivity } from '@/lib/ops-events';
import { sendStageEmail } from '@/lib/email';
import { makeUnsubscribeToken } from '@/lib/unsubscribe-token';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  // Rejects protocol-relative (//evil.com) and backslash tricks — only same-site
  // paths survive, otherwise /chat.
  const next = sanitizeNextPath(requestUrl.searchParams.get('next'), requestUrl.origin);
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  if (errorParam) {
    const loginUrl = new URL('/login', requestUrl.origin);
    if (errorDescription) {
      loginUrl.searchParams.set('error', errorDescription);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Session cookies must be attached to the redirect response itself. Writing them to the
  // cookies() store and then returning a fresh NextResponse drops them, so the browser came
  // back from Google without a session and bounced straight to /login.
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  let lastHeaders: Record<string, string> = {};
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    {
      cookieEncoding: 'base64url',
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            pendingCookies.push({ name, value, options });
          });
          lastHeaders = headers ?? {};
        },
      },
    }
  );

  function redirectWithCookies(url: URL) {
    const response = new NextResponse(null, { status: 308, headers: { Location: url.toString() } });
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    Object.entries(lastHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  console.log('OAuth callback start', {
    hasCode: Boolean(code),
    requestCookies: cookieStore.getAll().map((entry) => entry.name),
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  console.log('OAuth exchange result', {
    ok: !error,
    error: error?.message ?? null,
    cookiesToSet: pendingCookies.map((entry) => entry.name),
  });

  if (error) {
    console.error('OAuth callback exchange failed:', error.message);
    // Still carry the pending cookie mutations (verifier cleanup) so a failed exchange does
    // not leave a stale code_verifier behind for the next attempt.
    return redirectWithCookies(new URL('/login', request.url));
  }

  // Open auth: any Google account that completes OAuth keeps the session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn('OAuth callback: exchange succeeded but no user returned');
    return redirectWithCookies(new URL('/login', request.url));
  }

  // Blueprint email-gate merge (master brief 6): a signed-in visitor holding
  // the anonymous bf_bp cookie takes the session's blueprints into their
  // account. Best-effort like every other side effect here — any failure logs
  // and continues; signing in must never break over a merge.
  const blueprintSecret =
    process.env.BLUEPRINT_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const bpCookie = cookieStore.get('bf_bp')?.value ?? null;
  if (bpCookie && blueprintSecret) {
    try {
      const bpSessionId = verifySessionToken(bpCookie, blueprintSecret);
      if (bpSessionId) {
        const merged = await mergeBlueprintSessionToUser(bpSessionId, user.id);
        if (merged.ok) {
          console.log('OAuth callback: blueprint merge', {
            blueprintSession: bpSessionId,
            blueprints: merged.merged,
          });
        } else {
          console.warn('OAuth callback: blueprint merge failed:', merged.error);
        }
        // Counted only for the email flow (bp=email is appended by the login
        // page's OTP redirect); a Google sign-in on the same device merges
        // too, but it is not a magic-link click.
        if (requestUrl.searchParams.get('bp') === 'email') {
          await recordFunnelEvent('blueprint_magic_link_clicked', {
            signedIn: true,
            properties: { source: 'email' },
          });
        }
      }
    } catch (error) {
      console.error(
        'OAuth callback: blueprint merge threw:',
        error instanceof Error ? error.message : error
      );
    }
  }

  // First sign-in: welcome the new member to the registration channel. Best-effort and
  // never blocks the redirect — the count and the Discord post are awaited, but a missing
  // service-role key, webhook or network failure just means no notice, not a failed login.
  const freshSignup = Boolean(user.created_at && isFreshSignup(user.created_at));
  let registrationSent: boolean | null = null;
  if (freshSignup) {
    const memberCount = await countRegisteredProfiles();
    const result = await postRegistrationNotice({
      email: user.email,
      memberCount: memberCount ?? undefined,
      when: user.created_at,
    });
    registrationSent = result.sent;
    console.log('OAuth callback: registration notice', {
      sent: result.sent,
      reason: result.reason ?? null,
      memberCount: memberCount ?? null,
    });
    await postPublicActivity('member_joined');

    // Welcome email to the new member. Best-effort like the Discord notice: a
    // missing RESEND key or a provider hiccup logs and moves on, never blocks sign-in.
    if (user.email) {
      const unsubscribeToken = makeUnsubscribeToken(user.id);
      const welcome = await sendStageEmail('welcome', user.email, {
        chatUrl: new URL('/chat', requestUrl.origin).toString(),
        ...(unsubscribeToken
          ? {
              unsubscribeUrl: new URL(
                `/api/email/unsubscribe?token=${unsubscribeToken}`,
                requestUrl.origin
              ).toString(),
            }
          : {}),
      });
      console.log('OAuth callback: welcome email', {
        ok: welcome.ok,
        error: welcome.ok ? null : welcome.error,
        unsubscribe: Boolean(unsubscribeToken),
      });
    }
  }

  // Fresh accounts run the onboarding wizard first (terms, birthday, username);
  // the wizard resumes the original destination when it finishes. Existing
  // accounts keep going wherever they were headed.
  const destination = freshSignup ? `/onboarding?next=${encodeURIComponent(next)}` : next;
  const redirectUrl = new URL(destination, requestUrl.origin);
  console.log('OAuth callback success', { redirect: destination, registrationSent });
  return redirectWithCookies(redirectUrl);
}
