import type { Metadata } from 'next';
import { SOCIAL_LINKS } from '@/lib/social-links.js';

// One place for how BrandForge presents itself to search engines, link previews and AI assistants: the page metadata
// (title, description, canonical address, Open Graph and Twitter cards) and the structured data (schema.org JSON-LD).
// Everything states only what is true on the page: no ratings, review counts or awards are ever invented.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brandforge.gg').replace(/\/$/, '');
export const SITE_NAME = 'BrandForge';
export const SITE_TAGLINE = 'AI and people, one workspace';
const COMMUNITY = ['https://discord.gg/GSKHXkUY85', 'https://t.me/BrandForge_gg'];

/** The picture that shows when a page is shared: drawn on demand from the page's own title and line (see app/og). */
export function ogImageUrl(title: string, line = ''): string {
  const params = new URLSearchParams({ title: title.slice(0, 90) });
  if (line) params.set('line', line.slice(0, 130));
  return `${SITE_URL}/og?${params.toString()}`;
}

function shortTitle(title: string): string {
  return title.replace(/\s+[—-]\s+BrandForge$/i, '').replace(/^BrandForge( for)?:?\s*/i, '').trim() || title;
}

/** Full metadata for a page: canonical, Open Graph, Twitter card. `noindex` keeps private or thin pages out of results. */
export function pageMeta(input: { path: string; title: string; description: string; noindex?: boolean; type?: 'website' | 'article'; image?: string }): Metadata {
  const { path, title, description } = input;
  const image = input.image ?? ogImageUrl(shortTitle(title), description);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: `${SITE_URL}${path}`, siteName: SITE_NAME, type: input.type ?? 'website', locale: 'en_US', images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    ...(input.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

// ---- Structured data (schema.org) ----

type Json = Record<string, unknown>;

export function organizationLd(): Json {
  return {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/apple-touch-icon.png`, width: 180, height: 180 },
    description: 'A workspace where AI and people work together: make and publish every kind of message, trade products, services and requests, and hire the BrandForge team, with milestone contracts held in escrow.',
    slogan: SITE_TAGLINE,
    email: 'hello@brandforge.gg',
    sameAs: [...SOCIAL_LINKS.map((link: { href: string }) => link.href), ...COMMUNITY],
  };
}

export function websiteLd(): Json {
  return { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: SITE_URL, name: SITE_NAME, description: SITE_TAGLINE, inLanguage: 'en', publisher: { '@id': `${SITE_URL}/#organization` } };
}

export function softwareLd(): Json {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#app`,
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'Describe what you want in a chat. AI drafts it in seconds: carousels, ads, quotes, tips, announcements, polls and a week of posts. People finish the job: your team, or the BrandForge team on a monthly plan or a fixed-price project.',
    featureList: ['A chat that researches and plans', 'Carousels, ads, quotes, tips, announcements and polls', 'A week of posts written from a sentence, a link or a file', 'An open marketplace for products, services and requests', 'Milestone contracts with escrow', 'The BrandForge team by the month'],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', description: 'Free to start, with no card and no sign-up to try it.' },
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

/** The whole-site graph: who we are, the site, and the product. Rendered once in the root layout. */
export function siteGraph(): Json {
  return { '@context': 'https://schema.org', '@graph': [organizationLd(), websiteLd(), softwareLd()] };
}

export type Crumb = { name: string; path: string };

export function breadcrumbLd(trail: Crumb[]): Json {
  return { '@type': 'BreadcrumbList', itemListElement: trail.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: `${SITE_URL}${crumb.path}` })) };
}

/** A page of the site: what it is, where it sits, and (optionally) extra nodes such as an FAQ or a list of offers. */
export function pageGraph(input: { path: string; name: string; description: string; kind?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage' | 'FAQPage'; crumbs?: Crumb[]; extra?: Json[] }): Json {
  const url = `${SITE_URL}${input.path}`;
  const trail = input.crumbs ?? (input.path === '/' ? [{ name: 'Home', path: '/' }] : [{ name: 'Home', path: '/' }, { name: input.name, path: input.path }]);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': input.kind ?? 'WebPage', '@id': `${url}#page`, url, name: input.name, description: input.description, isPartOf: { '@id': `${SITE_URL}/#website` }, about: { '@id': `${SITE_URL}/#organization` }, inLanguage: 'en', breadcrumb: { '@id': `${url}#breadcrumb` } },
      { ...breadcrumbLd(trail), '@id': `${url}#breadcrumb` },
      ...(input.extra ?? []),
    ],
  };
}

export function faqLd(items: { question: string; answer: string }[]): Json {
  return { '@type': 'FAQPage', mainEntity: items.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) };
}

export function offerLd(input: { name: string; description: string; price: string | number; currency?: string; monthly?: boolean; path: string }): Json {
  return {
    '@type': 'Service',
    name: input.name,
    description: input.description,
    provider: { '@id': `${SITE_URL}/#organization` },
    url: `${SITE_URL}${input.path}`,
    offers: {
      '@type': 'Offer',
      price: String(input.price),
      priceCurrency: input.currency ?? 'EUR',
      ...(input.monthly ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: String(input.price), priceCurrency: input.currency ?? 'EUR', unitCode: 'MON', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } } } : {}),
    },
  };
}

export function blogPostingLd(input: { path: string; title: string; description: string; date: string }): Json {
  const url = `${SITE_URL}${input.path}`;
  return { '@type': 'BlogPosting', '@id': `${url}`, mainEntityOfPage: url, headline: input.title.slice(0, 110), description: input.description.slice(0, 280), datePublished: input.date, dateModified: input.date, author: { '@id': `${SITE_URL}/#organization` }, publisher: { '@id': `${SITE_URL}/#organization` }, inLanguage: 'en' };
}

/** JSON for a <script type="application/ld+json">: `<` is escaped so no text in the data can close the tag. */
const BACKSLASH = String.fromCharCode(92);
const LINE_SEP = new RegExp(String.fromCharCode(0x2028), 'g');
const PARA_SEP = new RegExp(String.fromCharCode(0x2029), 'g');

export function ldString(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, `${BACKSLASH}u003c`)
    .replace(LINE_SEP, `${BACKSLASH}u2028`)
    .replace(PARA_SEP, `${BACKSLASH}u2029`);
}
