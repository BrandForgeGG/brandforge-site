import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { PORTFOLIO_PROJECTS, projectSlug } from '@/lib/portfolio-projects';

export function generateStaticParams() {
  return PORTFOLIO_PROJECTS.map((project) => ({ slug: projectSlug(project.name) }));
}

type Props = { params: Promise<{ slug: string }> };

function find(slug: string) {
  return PORTFOLIO_PROJECTS.find((project) => projectSlug(project.name) === slug) ?? null;
}

export async function generateMetadata({ params }: Props) {
  const project = find((await params).slug);
  if (!project) return { title: 'Work — BrandForge' };
  return { title: `${project.name} — BrandForge`, description: `${project.description}. Shipped by the BrandForge team.` };
}

export default async function CaseStudyPage({ params }: Props) {
  const project = find((await params).slug);
  if (!project) notFound();
  const isStore = /apps\.apple\.com/.test(project.url);
  const isSocial = /instagram\.com/.test(project.url);
  const linkLabel = isStore ? 'View on the App Store' : isSocial ? 'View on Instagram' : 'Open the live site';

  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-4xl px-6 py-14">
        <Link href="/work" className="text-sm text-muted transition hover:text-foreground">← All work</Link>
        <p className="mt-6 text-xs uppercase tracking-[0.2em] text-copper">{project.category}</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl">{project.name}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{project.description}</p>

        <div className="relative mt-8 aspect-[16/10] overflow-hidden rounded-2xl border border-line bg-panel-2">
          {project.screenshot ? (
            <Image src={project.screenshot} alt={`Screenshot of ${project.name}`} fill sizes="(max-width: 896px) 100vw, 896px" className="object-cover object-top" priority />
          ) : (
            <div className="flex h-full items-center justify-center font-serif text-6xl text-muted">{project.name.charAt(0)}</div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href={project.url} target="_blank" rel="noreferrer" className="rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90">{linkLabel}</a>
          <Link href="/chat" className="rounded-xl border border-line px-4 py-2.5 text-sm text-foreground transition hover:border-ember">Start something like this</Link>
        </div>

        <section className="mt-12 grid gap-6 border-t border-line pt-8 sm:grid-cols-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">What it is</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground">{project.description}</p>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Type of project</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground">{project.category}</p>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">How to check it</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground">It is live. Open it and see for yourself. We do not publish numbers we cannot show.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
