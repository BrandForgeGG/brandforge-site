import Link from 'next/link';

export const metadata = {
  title: 'Not found — BrandForge',
  description: 'This page does not exist. Open the app and describe your project instead.',
};

export default function NotFound() {
  return (
    <div className="bf-page">
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[#b8763b]">Lost</p>
        <h1 className="mt-2 font-serif text-4xl text-[#ece7de] sm:text-5xl">
          This page went missing
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-[#9aa0a6]">
          The link is wrong or the page moved. Your projects are safe — open the chat
          and carry on.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link
            href="/chat"
            className="rounded-xl bg-[#e8571e] px-6 py-3 text-sm font-semibold text-[#14171a] transition hover:opacity-95"
          >
            Open the chat
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-white/10 px-6 py-3 text-sm text-[#ece7de] transition hover:border-[#e8571e]"
          >
            Go home
          </Link>
        </div>
      </main>
    </div>
  );
}
