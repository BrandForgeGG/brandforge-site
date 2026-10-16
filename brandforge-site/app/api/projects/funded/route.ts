import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { getProjectManager, isStaffAccount, listFundedProjects } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

// GET: funded tasks, projects and team plans this person is part of (staff: all of them), and who manages them.
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const staff = await isStaffAccount(user.id).catch(() => false);
  const [projects, manager] = await Promise.all([listFundedProjects(user.id, staff), getProjectManager()]);
  return NextResponse.json({ projects, manager: manager ? { name: manager.name, avatarUrl: manager.avatarUrl } : null, staff }, { headers: { 'Cache-Control': 'private, no-store' } });
}
