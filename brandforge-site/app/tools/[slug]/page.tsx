import { notFound } from 'next/navigation';
import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { ToolStarter } from '@/components/tool-starter';
import { FREE_TOOLS, getFreeTool } from '@/lib/free-tools';

export function generateStaticParams() {
  return FREE_TOOLS.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const tool = getFreeTool((await params).slug);
  if (!tool) return {};
  return {
    title: `${tool.title} — BrandForge`,
    description: tool.description,
    alternates: { canonical: `/tools/${tool.slug}` },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const tool = getFreeTool((await params).slug);
  if (!tool) notFound();

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tool.name,
    description: tool.description,
    url: `https://brandforge.gg/tools/${tool.slug}`,
    applicationCategory: 'BusinessApplication',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  };

  return (
    <div className="bf-page">
      <LandingNav />
      <main className="px-6 pb-16 pt-14 text-center">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Free tool</p>
        <h1 className="mx-auto mt-2 max-w-2xl font-serif text-4xl leading-tight text-foreground sm:text-5xl">
          {tool.title}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base text-muted">{tool.description}</p>

        <ToolStarter slug={tool.slug} prompt={tool.prompt} cta={tool.cta} placeholder={tool.placeholder} />

        <ol className="mx-auto mt-12 grid max-w-2xl gap-3 sm:grid-cols-3">
          {tool.steps.map((step, index) => (
            <li key={step} className="rounded-2xl border border-line bg-panel p-4 text-left">
              <span className="font-serif text-lg text-ember">{index + 1}</span>
              <p className="mt-1 text-sm text-foreground">{step}</p>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-sm text-muted">
          More free tools:{' '}
          {FREE_TOOLS.filter((other) => other.slug !== tool.slug).map((other) => (
            <Link key={other.slug} href={`/tools/${other.slug}`} className="text-ember underline-offset-2 hover:underline">
              {other.name}
            </Link>
          ))}
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
