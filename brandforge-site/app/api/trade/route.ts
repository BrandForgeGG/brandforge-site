import { after, NextRequest, NextResponse } from 'next/server';
import { sendFirstTimeEmail } from '@/lib/first-time-email';
import {
  createTradeListing,
  ensureListingAssistant,
  getAdminIds,
  getAvatarUrls,
  getProfileDisplayName,
  getProfileRole,
  listMyTradeListings,
  listOpenTradeListings,
  announceReal,
  recordFunnelEvent,
} from '@/lib/project-db';
import { toListingView } from '@/lib/trade-view';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { validateListing, matches } from '@/lib/trade.js';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const CREATE_LIMIT = { limit: 10, windowMs: 24 * 60 * 60 * 1000 };

// Browsing is public so the Trade Center can earn its own visitors; contacting needs an account.
export async function GET(request: NextRequest) {
  try {
    const viewer = await getAuthenticatedUser(request).catch(() => null);
    const params = request.nextUrl.searchParams;
    const filter = {
      kind: params.get('kind') || undefined,
      category: params.get('category') || undefined,
      q: (params.get('q') || '').slice(0, 80) || undefined,
    };

    // ?mine=1: everything you have listed, open or closed, so nothing you made ever disappears.
    if (params.get('mine') === '1') {
      if (!viewer) return NextResponse.json({ listings: [] });
      const mine = await listMyTradeListings(viewer.id);
      if (!mine.ok) return NextResponse.json({ listings: [] });
      const name = await getProfileDisplayName(viewer.id);
      const mineFaces = await getAvatarUrls([viewer.id]);
      return NextResponse.json({ listings: mine.rows.map((row) => toListingView(row, name, viewer.id, mineFaces.get(viewer.id) ?? null)) });
    }

    const result = await listOpenTradeListings();
    if (!result.ok) {
      if (result.error === 'pending_migration') return NextResponse.json({ listings: [], pending: true });
      return NextResponse.json({ error: 'Could not load listings' }, { status: 500 });
    }

    const rows = result.rows.filter((row) => matches(row, filter)).slice(0, 60);
    const names = new Map<string, string>();
    for (const ownerId of new Set(rows.map((r) => r.owner_id))) {
      names.set(ownerId, await getProfileDisplayName(ownerId));
    }
    const faces = await getAvatarUrls([...names.keys()]);
    // Listings owned by a BrandForge admin account are BrandForge's own pre-made services.
    const officialIds = await getAdminIds([...names.keys()]);
    const viewerRole = viewer ? await getProfileRole(viewer.id) : null;
    return NextResponse.json({
      listings: rows.map((row) => toListingView(row, officialIds.has(row.owner_id) ? 'BrandForge' : (names.get(row.owner_id) ?? 'Member'), viewer?.id ?? null, officialIds.has(row.owner_id) ? null : (faces.get(row.owner_id) ?? null), officialIds.has(row.owner_id))),
      viewer: { signedIn: Boolean(viewer), isSpecialist: viewerRole === 'operator' || viewerRole === 'admin' },
    });
  } catch (error) {
    console.error('Trade list error:', error);
    return NextResponse.json({ error: 'Could not load listings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in to post a listing' }, { status: 401 });

    const rate = checkRateLimit(`trade-create:${user.id}`, CREATE_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'You have posted a lot today. Try again tomorrow.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const draft = validateListing(body);
    if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 });

    const screened = screenText(`${draft.value.title}\n${draft.value.description}`);
    if (!screened.ok) return NextResponse.json({ error: screened.message, policy: screened.category }, { status: 422 });

    const created = await createTradeListing(user.id, draft.value);
    if (!created.ok) {
      if (created.error === 'pending_migration') {
        return NextResponse.json({ error: 'The Trade Center is being set up. Try again shortly.' }, { status: 503 });
      }
      return NextResponse.json({ error: 'Could not post the listing' }, { status: 500 });
    }

    await recordFunnelEvent('trade_listing_created', { signedIn: true, properties: { source: draft.value.kind } });
    after(() => sendFirstTimeEmail(user.id, user.email, 'first_listing', { title: draft.value.title }));
    await announceReal('listing_posted', { title: draft.value.title }, [{ userId: user.id }]);
    // Every listing gets a chat that stays its main assistant. Best-effort: publishing never waits on it.
    const conversationId = await ensureListingAssistant(user.id, { id: created.row.id, title: created.row.title, description: created.row.description, category: created.row.category, kind: created.row.kind }).catch(() => null);
    return NextResponse.json({
      success: true,
      conversationId,
      listing: toListingView(created.row, await getProfileDisplayName(user.id), user.id),
    });
  } catch (error) {
    console.error('Trade create error:', error);
    return NextResponse.json({ error: 'Could not post the listing' }, { status: 500 });
  }
}
