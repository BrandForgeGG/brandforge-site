import { NextRequest, NextResponse } from 'next/server';
import { ensureListingAssistant, getTradeListing } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// POST: the chat that is the main assistant for your listing. It is made the first time and reopened after.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { id } = await params;
  const listing = await getTradeListing(id);
  if (!listing.ok || listing.row.owner_id !== user.id) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  const conversationId = await ensureListingAssistant(user.id, { id: listing.row.id, title: listing.row.title, description: listing.row.description, category: listing.row.category, kind: listing.row.kind });
  if (!conversationId) return NextResponse.json({ error: 'Could not open the assistant. Try again.' }, { status: 500 });
  return NextResponse.json({ conversationId });
}
