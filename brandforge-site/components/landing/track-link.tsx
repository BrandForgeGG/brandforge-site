'use client';

import Link from 'next/link';
import { trackEvent } from '@/lib/funnel-client';

// A link that also counts the click in the funnel (next_step_clicked, with where it was), so each call to action can be
// compared. Counting waits for the visitor's cookie choice like every other funnel event.
export function TrackLink({ href, source, className, children }: { href: string; source: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={className} onClick={() => trackEvent('next_step_clicked', { source })}>
      {children}
    </Link>
  );
}
