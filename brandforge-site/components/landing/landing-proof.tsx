import Image from 'next/image';

import Link from 'next/link';

import { PORTFOLIO_PROJECTS, projectSlug } from '@/lib/portfolio-projects';
import { LANDING_TESTIMONIAL_IDS, TESTIMONIALS } from '@/lib/testimonials';

const LANDING_QUOTES = LANDING_TESTIMONIAL_IDS.map((id) =>
  TESTIMONIALS.find((quote) => quote.id === id)
).filter((quote): quote is NonNullable<typeof quote> => Boolean(quote));

export function LandingProof() {
  return (
    <>
      <section id="work" className="border-t border-line px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="mt-2 font-serif text-3xl text-foreground sm:text-4xl">
              Projects built with BrandForge
            </h2>
            <p className="mt-3 text-sm text-muted">Real, live projects. Open them and judge the work.</p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PORTFOLIO_PROJECTS.slice(0, 3).map((project) => (
              <Link
                key={project.name}
                href={`/work/${projectSlug(project.name)}`}
                className="group rounded-2xl border border-line bg-panel p-5 transition hover:border-ember"
              >
                <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl bg-panel-2">
                  {project.screenshot ? (
                    <Image
                      src={project.screenshot}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover object-top"
                    />
                  ) : (
                    <span className="font-serif text-2xl text-muted">{project.name.charAt(0)}</span>
                  )}
                </div>
                <p className="mt-4 font-serif text-lg text-foreground">{project.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.15em] text-muted">{project.category}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{project.description}</p>
                <span className="mt-3 inline-block text-xs text-ember opacity-0 transition group-hover:opacity-100">
                  See the project →
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-6 text-center">
            <Link href="/work" className="text-sm text-ember underline-offset-2 hover:underline">See all projects</Link>
          </p>
        </div>
      </section>

      <section id="feedback" className="border-t border-line px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="mt-2 font-serif text-3xl text-foreground sm:text-4xl">
              In their words
            </h2>
            <p className="mt-3 text-sm text-muted">
              Copied straight from our Discord and Telegram — nothing edited.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING_QUOTES.slice(0, 3).map((quote) => (
              <figure key={quote.id} className="flex flex-col rounded-2xl border border-line bg-panel p-5">
                <blockquote className="flex-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {quote.text}
                </blockquote>
                <figcaption className="mt-4 flex items-center justify-between text-xs text-muted">
                  <span className="font-medium text-foreground">{quote.author}</span>
                  <span>{quote.date}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
