import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brandforge.gg';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // App surfaces and APIs are behind sign-in or machine-only; nothing to index there.
        disallow: ['/api/', '/admin/', '/settings/', '/chat'],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
