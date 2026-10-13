import type { MetadataRoute } from 'next';
import { PORTFOLIO_PROJECTS, projectSlug } from '@/lib/portfolio-projects';
import { SITE_URL } from '@/lib/seo';

// Public pages only: the product itself (/chat, /settings /admin) requires sign-in and stays out of the index. /login is
// deliberately omitted: it is a door, not content. `lastModified` is the day each page's content last changed, so crawlers
// can skip what has not moved. Update a date here when its page changes.
const PAGES: Array<{ path: string; frequency: 'daily' | 'weekly' | 'monthly'; priority: number; modified: string }> = [
  { path: '/', frequency: 'weekly', priority: 1.0, modified: '2026-10-12' },
  { path: '/features', frequency: 'weekly', priority: 0.9, modified: '2026-10-12' },
  { path: '/pricing', frequency: 'weekly', priority: 0.9, modified: '2026-10-12' },
  { path: '/create', frequency: 'weekly', priority: 0.9, modified: '2026-10-11' },
  { path: '/distribute', frequency: 'weekly', priority: 0.8, modified: '2026-10-12' },
  { path: '/trade', frequency: 'daily', priority: 0.8, modified: '2026-10-12' },
  { path: '/explore', frequency: 'daily', priority: 0.7, modified: '2026-10-13' },
  { path: '/platform', frequency: 'weekly', priority: 0.8, modified: '2026-10-05' },
  { path: '/apply', frequency: 'monthly', priority: 0.8, modified: '2026-10-05' },
  { path: '/enterprise', frequency: 'monthly', priority: 0.7, modified: '2026-10-11' },
  { path: '/work', frequency: 'weekly', priority: 0.7, modified: '2026-10-09' },
  { path: '/specialists', frequency: 'weekly', priority: 0.7, modified: '2026-10-09' },
  { path: '/blog', frequency: 'weekly', priority: 0.7, modified: '2026-10-12' },
  { path: '/developers', frequency: 'monthly', priority: 0.6, modified: '2026-10-11' },
  { path: '/investors', frequency: 'monthly', priority: 0.6, modified: '2026-10-12' },
  { path: '/about', frequency: 'monthly', priority: 0.6, modified: '2026-10-11' },
  { path: '/careers', frequency: 'monthly', priority: 0.5, modified: '2026-10-11' },
  { path: '/terms', frequency: 'monthly', priority: 0.3, modified: '2026-09-28' },
  { path: '/privacy', frequency: 'monthly', priority: 0.3, modified: '2026-10-12' },
  { path: '/refunds', frequency: 'monthly', priority: 0.3, modified: '2026-09-28' },
  { path: '/data-deletion', frequency: 'monthly', priority: 0.2, modified: '2026-09-28' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = PAGES.map(({ path, frequency, priority, modified }) => ({ url: `${SITE_URL}${path}`, lastModified: new Date(`${modified}T00:00:00Z`), changeFrequency: frequency, priority }));
  const work = PORTFOLIO_PROJECTS.map((project) => ({ url: `${SITE_URL}/work/${projectSlug(project.name)}`, lastModified: new Date('2026-10-09T00:00:00Z'), changeFrequency: 'monthly' as const, priority: 0.5 }));
  return [...pages, ...work];
}
