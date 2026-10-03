import Link from 'next/link';

export const metadata = {
  title: 'Not found — BrandForge',
  description: 'This page does not exist. Open the app and describe your project instead.',
};

export default function NotFound() {
  return (
    <div className="bf-page">
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Lost</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl">
          This page went missing
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
          The link is wrong or the page moved. Your projects are safe — open the chat
          and carry on.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link
            href="/chat"
            className="rounded-xl bg-ember px-6 py-3 text-sm font-semibold text-background transition hover:opacity-95"
          >
            Open the chat
          </Link>
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
