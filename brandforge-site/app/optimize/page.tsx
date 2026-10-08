import Link from 'next/link';
import { AppShell } from '@/components/app-shell';

export const metadata = { title: 'Optimize — BrandForge' };

const STEPS = [
  { title: 'Connect a channel', line: 'Link where you publish, in Settings.' },
  { title: 'We read the results', line: 'Reach, clicks and replies, from the channel itself.' },
  { title: 'You get what to change', line: 'Plain next steps, back in your chat.' },
];

export default function OptimizePage() {
  return (
    <AppShell title="Optimize" subtitle="What worked, and what to change next.">
      <div className="max-w-2xl">
        <ol className="grid gap-4 sm:grid-cols-3" aria-label="How Optimize works">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3 sm:block">
              <span className="bf-pop flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-sm text-ember" style={{ animationDelay: `${index * 0.25}s` }}>
                {index + 1}
              </span>
              <div className="sm:mt-3">
                <p className="font-serif text-base text-foreground">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.line}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="bf-card mt-8 p-5">
          <p className="text-sm text-foreground">No channel is connected yet, so there is nothing real to analyse.</p>
          <p className="mt-1 text-sm text-muted">We won&apos;t invent numbers. Until then, ask in chat for a review of any draft or live page.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/settings#integrations" className="bf-button bf-button-primary">Connect a channel</Link>
            <Link href="/" className="bf-button">Review something in chat</Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
