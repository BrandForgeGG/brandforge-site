import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { completeOnboarding, recordFunnelEvent } from '@/lib/project-db';
import { checkRateLimit } from '@/lib/rate-limit';

const ONBOARDING_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

export const dynamic = 'force-dynamic';

// Minimum age for an account, mirroring the platform rule we state on the wizard.
const MIN_AGE_YEARS = 13;
const MAX_AGE_YEARS = 120;

function validateDateOfBirth(value: unknown): { ok: true; date: string } | { ok: false; reason: string } {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, reason: 'Enter your date of birth as YYYY-MM-DD.' };
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  if (!isRealDate) {
    return { ok: false, reason: 'That date does not exist.' };
  }

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (parsed.getTime() > todayUtc) {
    return { ok: false, reason: 'Date of birth cannot be in the future.' };
  }

  let age = now.getUTCFullYear() - year;
  const hadBirthdayThisYear =
    now.getUTCMonth() + 1 > month || (now.getUTCMonth() + 1 === month && now.getUTCDate() >= day);
  if (!hadBirthdayThisYear) age -= 1;

  if (age < MIN_AGE_YEARS) {
    return { ok: false, reason: `You must be at least ${MIN_AGE_YEARS} years old to use BrandForge.` };
  }
  if (age > MAX_AGE_YEARS) {
    return { ok: false, reason: 'That date of birth looks incorrect.' };
  }

  return { ok: true, date: value };
}

// Completes the first-run wizard in a single write: terms acceptance is
// mandatory, promotional notifications are opt-in, birthday is required, and
// the username is checked for uniqueness by the database.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const rate = checkRateLimit(`onboarding:${user.id}`, ONBOARDING_RATE_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      date_of_birth?: unknown;
      accept_terms?: unknown;
      marketing_opt_in?: unknown;
      username?: unknown;
    };

    if (body.accept_terms !== true) {
      return NextResponse.json(
        { error: 'You must accept the Terms of Service to continue.' },
        { status: 400 },
      );
    }

    const dob = validateDateOfBirth(body.date_of_birth);
    if (!dob.ok) {
      return NextResponse.json({ error: dob.reason }, { status: 400 });
    }

    if (typeof body.username !== 'string' || !body.username.trim()) {
      return NextResponse.json({ error: 'Choose a username.' }, { status: 400 });
    }

    const result = await completeOnboarding(user.id, {
      username: body.username,
      dateOfBirth: dob.date,
      marketingOptIn: body.marketing_opt_in === true,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: result.status });
    }

    await recordFunnelEvent('onboarding_completed', { signedIn: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Onboarding error:', error);
    return NextResponse.json({ error: 'Could not save your setup.' }, { status: 500 });
  }
}
