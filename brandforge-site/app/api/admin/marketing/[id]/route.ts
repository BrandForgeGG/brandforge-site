import { NextRequest, NextResponse } from 'next/server';
import { deleteMarketingPost, isAdminAccount } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// DELETE /api/admin/marketing/[id] — discard a queued or failed draft.
// Posted rows are kept as history (the wrapper refuses them) and come back 404.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!(await isAdminAccount(user.id))) {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || id.length > 64) return NextResponse.json({ error: 'Invalid post id' }, { status: 400 });

    const result = await deleteMarketingPost(id);
    if (!result.ok) {
      if (result.error === 'not_found') {
        return NextResponse.json({ error: 'Draft not found (posted history cannot be deleted)' }, { status: 404 });
      }
      return NextResponse.json(
        { error: result.error === 'not_configured' ? 'Service role key is not configured' : 'Failed to discard the draft' },
        { status: result.error === 'not_configured' ? 503 : 500 }
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Marketing delete error:', error);
    return NextResponse.json({ error: 'Failed to discard the draft' }, { status: 500 });
  }
}
