import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const metadata: Metadata = pageMeta({ path: "/projects", title: "Your projects — BrandForge", description: "Your funded tasks and projects, with your dedicated project manager.", noindex: true });

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
