import { NextResponse } from 'next/server';
import { getAvatarUrls, getProfileDisplayNames, listPublishedPosts } from '@/lib/project-db';
import { statsFor } from '@/lib/post-stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

// GET: the latest posts members published through BrandForge: a link to each post on its network, its picture, and the
// public numbers the network shares (likes, reposts, replies, views). These posts are public on their networks already.
export async function GET() {
  const rows = await listPublishedPosts(24);
  const ids = rows.map((row) => row.user_id);
  const [names, avatars, stats] = await Promise.all([getProfileDisplayNames(ids), getAvatarUrls(ids), Promise.all(rows.map((row) => statsFor(row.network, row.url)))]);
  return NextResponse.json(
    {
      posts: rows.map((row, i) => {
        const { image, ...numbers } = stats[i];
        return {
          id: row.id,
          network: row.network,
          url: row.url,
          caption: row.caption,
          createdAt: row.created_at,
          image: row.thumb_url || image || null,
          stats: numbers,
          ownerName: names.get(row.user_id) ?? 'A member',
          ownerAvatar: avatars.get(row.user_id) ?? null,
        };
      }),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}
