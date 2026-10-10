import Link from 'next/link';
import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { listPublicSpecialists } from '@/lib/project-db';

export const metadata = {
  title: 'The BrandForge team — BrandForge',
  description: 'How BrandForge vets its team, how they get paid, and who is listed today.',
};

export const dynamic = 'force-dynamic';

const VETTING: { title: string; body: string }[] = [
  { title: 'They apply', body: 'Every team member sends an application with their specialty, links to real work and a short note. There is no pay-to-join.' },
  { title: 'A person reads it', body: 'Someone on the BrandForge team reviews the work they linked. We accept people whose work we can open and judge.' },
  { title: 'They earn trust job by job', body: 'A team member can only send a priced proposal on a brief they have opened. Founders see the price, the timeline and the plan before saying yes.' },
  { title: 'Money is held, then released', body: 'Funds for a milestone are held until the founder approves the work. If something goes wrong, the money stays held and a person from BrandForge reviews both sides.' },
  { title: 'Declines count', body: 'A team member whose proposals a founder declines twice on one brief is out of that brief. Quality is protected on both sides.' },
];

export default async function SpecialistsPage() {
  const specialists = await listPublicSpecialists().catch(() => []);
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="font-serif text-4xl text-foreground sm:text-5xl">The BrandForge team you can trust with the finish</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">AI drafts it in seconds. A vetted person takes it from there. Here is how people get in, and how everyone stays protected.</p>

        <ol className="mt-10 grid gap-5 sm:grid-cols-2">
          {VETTING.map((step) => (
            <li key={step.title} className="rounded-2xl border border-line bg-panel p-5">
              <p className="font-serif text-xl text-foreground">{step.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>

        <section className="mt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-serif text-2xl text-foreground">Listed team members</h2>
            <Link href="/apply" className="text-sm text-ember underline-offset-2 hover:underline">Apply to join</Link>
          </div>
          {specialists.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
              No one is listed yet. Team members choose whether to be listed, and we only show people who said yes. Want to be the first? <Link href="/apply" className="text-ember underline-offset-2 hover:underline">Apply here</Link>.
            </p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {specialists.map((s) => (
                <li key={s.handle}>
                  <Link href={`/specialists/${s.handle}`} className="block rounded-2xl border border-line bg-panel p-5 transition hover:border-ember">
                    <p className="font-serif text-xl text-foreground">{s.display_name}</p>
                    <p className="mt-1 text-sm text-muted">{s.headline}</p>
                    {s.skills.length > 0 ? <p className="mt-3 text-xs text-muted">{s.skills.slice(0, 4).join(' · ')}</p> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6 text-sm text-muted">Already approved? <Link href="/specialists/me" className="text-ember underline-offset-2 hover:underline">Edit your profile</Link>.</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
