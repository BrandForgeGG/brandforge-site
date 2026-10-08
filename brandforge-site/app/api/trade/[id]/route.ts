import { NextRequest, NextResponse } from 'next/server';
import { closeTradeListing, getProfileDisplayName, updateTradeListing } from '@/lib/project-db';
import { toListingView } from '@/lib/trade-view';
import { validateListing } from '@/lib/trade.js';
import { screenText } from '@/lib/content-policy.js';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// PATCH edits your own open listing (same rules as posting one).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

    const { id } = await params;
    if (!id || id.length > 64) return NextResponse.json({ error: 'Invalid listing' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const draft = validateListing(body);
    if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 });
    const screened = screenText(`${draft.value.title}\n${draft.value.description}`);
    if (!screened.ok) return NextResponse.json({ error: screened.message, policy: screened.category }, { status: 422 });

    const result = await updateTradeListing(id, user.id, draft.value);
    if (!result.ok) {
      return NextResponse.json({ error: 'Listing not found' }, { status: result.error === 'not_found' ? 404 : 500 });
    }
    return NextResponse.json({ success: true, listing: toListingView(result.row, await getProfileDisplayName(user.id), user.id) });
  } catch (error) {
    console.error('Trade update error:', error);
    return NextResponse.json({ error: 'Could not update the listing' }, { status: 500 });
  }
}

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
