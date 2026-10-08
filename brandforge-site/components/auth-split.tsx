'use client';

import Link from 'next/link';
import { SignInForm } from '@/components/sign-in-form';

// The right-side diagram: what actually happens between an idea and shipped work.
const FLOW = [
  { title: 'Describe it', body: 'Type, paste a URL or drop a file.' },
  { title: 'Get the plan', body: 'AI researches it and structures the work.' },
  { title: 'Build together', body: 'Invite your team into the same chat.' },
  { title: 'Ship and spread', body: 'Create the assets and distribute them.' },
];

export function AuthSplit() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-10 lg:w-[55%] lg:px-20">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="font-serif text-2xl text-foreground" aria-label="BrandForge home">
            Brand<span className="text-ember">Forge</span>
          </Link>

          <h1 className="mt-8 font-serif text-3xl text-foreground sm:text-4xl">Continue to BrandForge</h1>
          <p className="mt-3 mb-8 text-sm leading-relaxed text-muted">New or returning, same buttons. Free to start, no card.</p>

          <SignInForm />

          <p className="mt-6 text-sm text-muted">
            Want to work with us?{' '}
            <Link href="/apply" className="font-medium text-ember">
              Apply as a specialist
            </Link>
          </p>
        </div>
      </div>

      <aside className="hidden border-l border-line bg-panel lg:flex lg:w-[45%] lg:flex-col lg:justify-center lg:px-16" aria-hidden="true">
        <div className="mx-auto w-full max-w-sm">
          <h2 className="font-serif text-2xl text-foreground">Idea to audience</h2>
          <ol className="mt-8 space-y-6">
            {FLOW.map((step, index) => (
              <li key={step.title} className="relative flex gap-4">
                {index < FLOW.length - 1 ? <span className="absolute left-[15px] top-10 h-[calc(100%+0.5rem)] w-px bg-line" /> : null}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ember/40 bg-ember/10 text-sm font-semibold text-ember">{index + 1}</span>
                <div className="pb-1">
                  <p className="font-serif text-lg text-foreground">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-xs text-muted">Your work is saved the moment you sign in.</p>
        </div>
      </aside>
    </div>
  );
}
