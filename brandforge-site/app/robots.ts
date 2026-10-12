import type { MetadataRoute } from 'next';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brandforge.gg').replace(/\/$/, '');

// App surfaces and APIs are behind sign-in or machine-only; nothing to index there.
const PRIVATE = ['/api/', '/admin', '/settings', '/chat', '/login', '/join', '/onboarding', '/projects', '/og?', '/specialists/me'];

// AI search and assistant crawlers are welcome on the public pages, so BrandForge can be found and cited in AI answers. Each is
// named on purpose: a named allow is a clear signal, and it keeps working if the default rule ever changes.
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Bingbot',
  'DuckAssistBot',
  'MistralAI-User',
  'cohere-ai',
  'Meta-ExternalAgent',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: ['/', '/llms.txt', '/llms-full.txt'], disallow: PRIVATE },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
