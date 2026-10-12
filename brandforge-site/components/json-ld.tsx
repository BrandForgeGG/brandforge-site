import { ldString } from '@/lib/seo';

// Structured data for search engines and AI assistants. Server-rendered, so it is in the page's HTML.
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldString(data) }} />;
}
