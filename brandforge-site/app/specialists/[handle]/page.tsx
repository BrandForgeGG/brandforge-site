import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { getPublicSpecialist } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props) {
  const specialist = await getPublicSpecialist((await params).handle).catch(() => null);
  if (!specialist) return { title: 'The team — BrandForge' };
  return { title: `${specialist.display_name} — BrandForge team`, description: specialist.headline };
}

export default async function SpecialistPage({ params }: Props) {
  const specialist = await getPublicSpecialist((await params).handle).catch(() => null);
  if (!specialist) notFound();

  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <Link href="/specialists" className="text-sm text-muted transition hover:text-foreground">← The whole team</Link>
        <h1 className="mt-6 font-serif text-4xl text-foreground sm:text-5xl">{specialist.display_name}</h1>
        <p className="mt-3 text-lg text-muted">{specialist.headline}</p>
        <p className="mt-2 text-xs text-muted">Vetted by the BrandForge team</p>

        {specialist.bio ? <p className="mt-8 whitespace-pre-line text-base leading-relaxed text-foreground">{specialist.bio}</p> : null}

        {specialist.skills.length > 0 ? (
          <ul className="mt-6 flex flex-wrap gap-2">
            {specialist.skills.map((skill) => (
              <li key={skill} className="rounded-full border border-line px-3 py-1 text-xs text-foreground">{skill}</li>
            ))}
          </ul>
        ) : null}

        {specialist.portfolio.length > 0 ? (
          <section className="mt-10 border-t border-line pt-6">
            <h2 className="font-serif text-2xl text-foreground">Portfolio</h2>
            <ul className="mt-4 divide-y divide-line">
              {specialist.portfolio.map((item) => (
                <li key={item.url} className="py-3">
                  <a href={item.url} target="_blank" rel="noreferrer nofollow" className="text-sm text-ember underline-offset-2 hover:underline">{item.title}</a>
                  <p className="text-xs text-muted">{new URL(item.url).host}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-12 rounded-2xl border border-line bg-panel p-6">
          <p className="font-serif text-xl text-foreground">Want help like this?</p>
          <p className="mt-2 text-sm text-muted">Describe your project in one message. If it needs the BrandForge team, you will see priced proposals and pay only when you approve the work.</p>
          <Link href="/chat" className="mt-4 inline-block rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90">Start your project</Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
