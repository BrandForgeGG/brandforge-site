import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brandforge.gg';

// Public pages only: the product itself (/chat, /settings, /admin) requires sign-in
// and stays out of the index.
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Array<{ path: string; frequency: 'weekly' | 'monthly'; priority: number }> = [
    { path: '/', frequency: 'weekly', priority: 1.0 },
    { path: '/apply', frequency: 'monthly', priority: 0.8 },
    { path: '/about', frequency: 'monthly', priority: 0.6 },
    { path: '/login', frequency: 'monthly', priority: 0.4 },
    { path: '/terms', frequency: 'monthly', priority: 0.3 },
    { path: '/privacy', frequency: 'monthly', priority: 0.3 },
    { path: '/refunds', frequency: 'monthly', priority: 0.3 },
  ];
  return pages.map(({ path, frequency, priority }) => ({
    url: `${SITE}${path}`,
    changeFrequency: frequency,
    priority,
  }));
}
