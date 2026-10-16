import type { Metadata } from 'next';
import { pageMeta, pageGraph } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';
import Image from 'next/image';
import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { PORTFOLIO_PROJECTS, projectSlug } from '@/lib/portfolio-projects';

export const metadata: Metadata = pageMeta({ path: "/work", title: "Work — BrandForge", description: "Real projects shipped by the BrandForge team. Open the live sites and judge the work yourself." });

export default function WorkPage() {
  return (
    <div className="bf-page">
      <JsonLd data={pageGraph({ path: "/work", name: "Work — BrandForge", description: "Real projects shipped by the BrandForge team. Open the live sites and judge the work yourself.", kind: "CollectionPage", crumbs: [{ name: "Work", path: "/work" }] })} />
      <LandingNav />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-serif text-4xl text-foreground sm:text-5xl">Work we have shipped</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
          Real sites and apps, live today. No mockups and no made-up numbers: open any of them and judge the work yourself.
        </p>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[...PORTFOLIO_PROJECTS].sort((a, b) => Number(Boolean(b.screenshot)) - Number(Boolean(a.screenshot))).map((project) => (
            <li key={project.name}>
              <Link href={`/work/${projectSlug(project.name)}`} className="group block rounded-2xl border border-line bg-panel p-4 transition hover:border-ember">
                <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-xl bg-panel-2">
                  {project.screenshot ? (
                    <Image src={project.screenshot} alt={`Screenshot of ${project.name}`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover object-top" />
                  ) : (
                    <span className="font-serif text-4xl text-muted">{project.name.charAt(0)}</span>
                  )}
                </div>
                <p className="mt-4 font-serif text-xl text-foreground">{project.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.15em] text-muted">{project.category}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{project.description}</p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-12 rounded-2xl border border-line bg-panel p-6">
          <p className="font-serif text-2xl text-foreground">Want this team on your brand every month?</p>
          <p className="mt-2 text-sm text-muted">Content, ads and site updates from €690 a month. If month one isn&apos;t delivered, you get a full refund.</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Link href="/pricing" className="rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90">See plans</Link>
            <Link href="/chat" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">Talk to the team</Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
