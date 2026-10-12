import type { Metadata } from 'next';
import { pageMeta, pageGraph } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';
export const metadata: Metadata = pageMeta({ path: "/apply", title: "Apply to join the BrandForge team — BrandForge", description: "Developers, designers, marketers and writers: apply to work on real briefs, get paid per milestone through escrow, and work next to a small team." });

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
