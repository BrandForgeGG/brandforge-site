import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { isAdminAccount, listRecentEmails } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

// GET ?q=: the latest emails the site sent (recipient, subject, delivered or not). Admin only.
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isAdminAccount(user.id))) return NextResponse.json({ error: 'Admin access only' }, { status: 403 });
  return NextResponse.json({ emails: await listRecentEmails(request.nextUrl.searchParams.get('q') ?? '') });
}
