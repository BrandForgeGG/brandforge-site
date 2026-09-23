import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdminAccount } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// GET /api/admin/applications — admin-only list of specialist applications.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!(await isAdminAccount(user.id))) {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 });
    }

    const supabase = await createSupabaseServerClient(request);
    const { data, error } = await supabase
      .from('operator_applications')
      .select('id, user_id, email, message, status, reviewed_by, reviewed_at, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Admin applications list error:', error.message);
      return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 });
    }

    return NextResponse.json({ applications: data ?? [] });
  } catch (error) {
    console.error('Admin applications list error:', error);
    return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 });
  }
}
