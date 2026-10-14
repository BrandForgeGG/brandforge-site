import { NextResponse } from 'next/server';
import { getAvatarUrls, getProfileDisplayNames, listPublishedPosts } from '@/lib/project-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: the latest posts members published through BrandForge, as links to the post on its network. These posts are public
// on the network already; only the link, the network and a short caption are shown.
export async function GET() {
  const rows = await listPublishedPosts(24);
  const ids = rows.map((row) => row.user_id);
  const [names, avatars] = await Promise.all([getProfileDisplayNames(ids), getAvatarUrls(ids)]);
  return NextResponse.json(
    { posts: rows.map((row) => ({ id: row.id, network: row.network, url: row.url, caption: row.caption, createdAt: row.created_at, ownerName: names.get(row.user_id) ?? 'A member', ownerAvatar: avatars.get(row.user_id) ?? null })) },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
  );
}
