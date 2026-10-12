import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const metadata: Metadata = pageMeta({ path: "/projects", title: "Your projects — BrandForge", description: "Every chat you have started, with where it stands.", noindex: true });

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
