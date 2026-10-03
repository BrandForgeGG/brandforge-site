'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server logs carry the full detail; the page stays plain-spoken.
    console.error('Route error:', error.message);
  }, [error]);

  return (
    <div className="bf-page">
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Hiccup</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl">
          Something broke on our side
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
          Nothing you did caused this. Try again — if it keeps happening, tell us in
          the chat or on Discord and we will fix it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-ember px-6 py-3 text-sm font-semibold text-background transition hover:opacity-95"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-xl border border-line px-6 py-3 text-sm text-foreground transition hover:border-ember"
          >
            Go home
          </Link>
        </div>
      </main>
    </div>
  );
}
