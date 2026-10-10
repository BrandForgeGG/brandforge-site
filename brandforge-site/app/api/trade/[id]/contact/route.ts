import { NextRequest, NextResponse } from 'next/server';
import {
  addMessage,
  createConversation,
  getProfileDisplayName,
  getProfileRole,
  getTradeListing,
  joinConversationAsMember,
  recordFunnelEvent,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const CONTACT_LIMIT = { limit: 20, windowMs: 24 * 60 * 60 * 1000 };

// POST opens a private chat between the caller and the listing's owner, with the caller's first
// message in it. The contract is then made in that chat (Actions -> Create a contract).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in to contact this member' }, { status: 401 });

    const { id } = await params;
    const listing = await getTradeListing(id);
    if (!listing.ok || listing.row.status !== 'open') {
      return NextResponse.json({ error: 'This listing is no longer open' }, { status: 404 });
    }
    if (listing.row.owner_id === user.id) {
      return NextResponse.json({ error: 'This is your own listing' }, { status: 400 });
    }

    // Answering a request for work is offering a service: specialists only.
    if (listing.row.kind === 'request') {
      const role = await getProfileRole(user.id);
      if (role !== 'operator' && role !== 'admin') {
        return NextResponse.json({ error: 'Offering services is for the BrandForge team. Apply first, it takes two minutes.', apply: true }, { status: 403 });
      }
    }

    const rate = checkRateLimit(`trade-contact:${user.id}`, CONTACT_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'You have contacted a lot of members today. Try again tomorrow.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const text = String(body.message ?? '').trim().slice(0, 1000);
    if (text.length < 10) {
      return NextResponse.json({ error: 'Write a short message (at least 10 characters).' }, { status: 400 });
    }
    const screened = screenText(text);
    if (!screened.ok) return NextResponse.json({ error: screened.message, policy: screened.category }, { status: 422 });

    const conversationId = await createConversation(user.id, listing.row.title.slice(0, 80), 'trade');
    if (!conversationId) return NextResponse.json({ error: 'Could not open the chat' }, { status: 500 });

    const [myName, ownerName] = await Promise.all([
      getProfileDisplayName(user.id),
      getProfileDisplayName(listing.row.owner_id),
    ]);

    const joined = await joinConversationAsMember(conversationId, listing.row.owner_id, ownerName);
    if (!joined.ok) return NextResponse.json({ error: 'Could not add the member to the chat' }, { status: 500 });

    await addMessage({
      conversation_id: conversationId,
      sender_type: 'user',
      sender_id: user.id,
      sender_name: myName,
      content: text,
    });
    await addMessage({
      conversation_id: conversationId,
      sender_type: 'ai',
      sender_name: 'BrandForge',
      content: `${myName} reached out about "${listing.row.title}". When you agree on terms, use Actions, then Create a contract.`,
      content_type: 'system',
    });

    await recordFunnelEvent('trade_offer_sent', { signedIn: true, properties: { source: listing.row.kind } });
    return NextResponse.json({ success: true, conversationId });
  } catch (error) {
    console.error('Trade contact error:', error);
    return NextResponse.json({ error: 'Could not open the chat' }, { status: 500 });
  }
}
