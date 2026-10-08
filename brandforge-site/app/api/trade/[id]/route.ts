import { NextRequest, NextResponse } from 'next/server';
import { closeTradeListing } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// DELETE closes your own listing (it stops showing; nothing is erased).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

    const { id } = await params;
    if (!id || id.length > 64) return NextResponse.json({ error: 'Invalid listing' }, { status: 400 });

    const result = await closeTradeListing(id, user.id);
    if (!result.ok) {
      return NextResponse.json({ error: 'Listing not found' }, { status: result.error === 'not_found' ? 404 : 500 });
    }
    return NextResponse.json({ closed: true });
  } catch (error) {
    console.error('Trade close error:', error);
    return NextResponse.json({ error: 'Could not close the listing' }, { status: 500 });
  }
}
