import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { isAdminAccount, listMembersForAdmin, setMemberRole } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) } as const;
  if (!(await isAdminAccount(user.id))) return { error: NextResponse.json({ error: 'Admin access only' }, { status: 403 }) } as const;
  return { user } as const;
}

// GET ?q=: members and their roles, newest first, for the admin People tab.
export async function GET(request: NextRequest) {
  const checked = await requireAdmin(request);
  if ('error' in checked) return checked.error;
  return NextResponse.json({ members: await listMembersForAdmin(request.nextUrl.searchParams.get('q') ?? '') });
}

// PATCH { userId, role }: give a member a role (user, operator or admin).
export async function PATCH(request: NextRequest) {
  const checked = await requireAdmin(request);
  if ('error' in checked) return checked.error;
  const body = (await request.json().catch(() => ({}))) as { userId?: unknown; role?: unknown };
  const userId = typeof body.userId === 'string' && /^[0-9a-f-]{36}$/i.test(body.userId) ? body.userId : null;
  const role = body.role === 'user' || body.role === 'operator' || body.role === 'admin' ? body.role : null;
  if (!userId || !role) return NextResponse.json({ error: 'Pick a member and a role.' }, { status: 400 });
  const result = await setMemberRole(checked.user.id, userId, role);
  if (result === 'self') return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 409 });
  if (result === 'last_admin') return NextResponse.json({ error: 'There must always be one admin.' }, { status: 409 });
  if (result === 'not_found') return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  if (result === 'failed') return NextResponse.json({ error: 'Could not change the role. Try again.' }, { status: 500 });
  return NextResponse.json({ ok: true, role });
}
