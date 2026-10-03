import { NextRequest, NextResponse } from 'next/server';
import { createMarketingPost, isAdminAccount, listMarketingPosts } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const CHANNELS = new Set(['discord', 'telegram', 'reddit']);

// GET /api/admin/marketing — admin-only view of the outbound post queue.
// The table has RLS with no policies, so reads/writes run through the
// service-role wrappers in lib/project-db (H7 boundary) after the caller
// has been proven to be an admin.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!(await isAdminAccount(user.id))) {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 });
    }

    const result = await listMarketingPosts();
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error === 'not_configured' ? 'Service role key is not configured' : 'Failed to load the queue' },
        { status: result.error === 'not_configured' ? 503 : 500 }
      );
    }

    return NextResponse.json({ posts: result.posts, counts: result.counts });
  } catch (error) {
    console.error('Admin marketing list error:', error);
    return NextResponse.json({ error: 'Failed to load the queue' }, { status: 500 });
  }
}

// POST /api/admin/marketing — queue a new outbound post. Rows land as 'queued';
// the processor (kill-switched off until MARKETING_ENABLED=true) publishes them.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!(await isAdminAccount(user.id))) {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 });
    }

    const channel = String(payload.channel ?? '');
    const target = String(payload.target ?? '').trim();
    const body = String(payload.body ?? '').trim();
    const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : null;
    const url = typeof payload.url === 'string' && payload.url.trim() ? payload.url.trim() : null;
    const scheduledAt = String(payload.scheduledAt ?? '').trim();

    if (!CHANNELS.has(channel)) {
      return NextResponse.json({ error: 'channel must be discord, telegram or reddit' }, { status: 400 });
    }
    if (!target) return NextResponse.json({ error: 'target is required' }, { status: 400 });
    if (target.length > 200) return NextResponse.json({ error: 'target is too long' }, { status: 400 });
    if (!body) return NextResponse.json({ error: 'body is required' }, { status: 400 });
    if (body.length > 4000) return NextResponse.json({ error: 'body is too long (max 4000)' }, { status: 400 });
    if (title && title.length > 200) return NextResponse.json({ error: 'title is too long' }, { status: 400 });

    const scheduled = scheduledAt ? new Date(scheduledAt) : new Date();
    if (Number.isNaN(scheduled.getTime())) {
      return NextResponse.json({ error: 'scheduledAt must be a valid date' }, { status: 400 });
    }

    const result = await createMarketingPost({
      channel,
      target,
      body,
      title,
      url,
      scheduledAt: scheduled.toISOString(),
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error === 'not_configured' ? 'Service role key is not configured' : 'Failed to queue the post' },
        { status: result.error === 'not_configured' ? 503 : 500 }
      );
    }

    return NextResponse.json({ post: result.post }, { status: 201 });
  } catch (error) {
    console.error('Admin marketing create error:', error);
    return NextResponse.json({ error: 'Failed to queue the post' }, { status: 500 });
  }
}
