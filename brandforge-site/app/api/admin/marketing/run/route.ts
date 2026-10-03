import { NextRequest, NextResponse } from 'next/server';
import { isAdminAccount, runDueMarketingPosts } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// POST /api/admin/marketing/run — admin-only "publish now": sends every queued
// row whose scheduled time has arrived, then reports what happened. The same
// routine is what a cron would call later; until a schedule exists this button
// is the processor's trigger.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!(await isAdminAccount(user.id))) {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 });
    }

    const result = await runDueMarketingPosts();

    if (!result.ran) {
      const status = result.reason === 'not_configured' ? 503 : 503;
      return NextResponse.json(
        {
          error:
            result.reason === 'MARKETING_ENABLED is not set to true'
              ? 'Publishing is switched off (MARKETING_ENABLED).'
              : 'The queue could not run right now.',
          reason: result.reason ?? null,
        },
        { status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Marketing run error:', error);
    return NextResponse.json({ error: 'The queue could not run right now.' }, { status: 500 });
  }
}
