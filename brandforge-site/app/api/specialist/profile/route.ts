import { NextRequest, NextResponse } from 'next/server';
import { getSpecialistProfile, isStaffAccount, saveSpecialistProfile } from '@/lib/project-db';
import { getActorName, getAuthenticatedUser } from '@/lib/supabase-server';
import { validateProfile } from '@/lib/specialist-profile.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

async function requireSpecialist(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: 'Sign in to edit your profile' }, { status: 401 }) } as const;
  if (!(await isStaffAccount(user.id))) {
    return { error: NextResponse.json({ error: 'Profiles are for approved specialists. Apply at /apply.' }, { status: 403 }) } as const;
  }
  return { user } as const;
}

// GET: your own profile, or nulls with a suggested name so the editor starts filled in.
export async function GET(request: NextRequest) {
  const auth = await requireSpecialist(request);
  if ('error' in auth) return auth.error;
  const profile = await getSpecialistProfile(auth.user.id);
  return NextResponse.json({ profile, suggestedName: getActorName(auth.user) });
}

// PUT: save your profile. Listing it publicly is your choice (isPublic).
export async function PUT(request: NextRequest) {
  const auth = await requireSpecialist(request);
  if ('error' in auth) return auth.error;
  const rate = checkRateLimit(`specialist-profile:${auth.user.id}`, { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many saves. Try again in a moment.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const checked = validateProfile(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const saved = await saveSpecialistProfile(auth.user.id, checked.value);
  if (!saved.ok) {
    if (saved.error === 'handle_taken') return NextResponse.json({ error: 'That handle is taken. Pick another.' }, { status: 409 });
    return NextResponse.json({ error: 'Could not save your profile.' }, { status: 500 });
  }
  return NextResponse.json({ profile: saved.row });
}
